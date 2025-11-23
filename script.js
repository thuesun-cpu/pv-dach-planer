// --- Grund-Setup -----------------------------------------------------------

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const resetPolygonBtn = document.getElementById("resetPolygonBtn");
const pointInfo = document.getElementById("pointInfo");

const roofTypeSelect = document.getElementById("roofType");
const tilesEaveInput = document.getElementById("tilesEave");
const tilesGableInput = document.getElementById("tilesGable");
const measureInfo = document.getElementById("measureInfo");

const orientationSelect = document.getElementById("orientation");
const moduleOpacityInput = document.getElementById("moduleOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");
const moduleInfo = document.getElementById("moduleInfo");

// Bild
let roofImage = null;

// Polygon (Dachfläche)
let points = [];          // [{x,y}, ...]
let isClosed = false;
let draggingPointIndex = -1;

// Maßstab
let scaleReady = false;
let metersPerPixelX = 0;
let metersPerPixelY = 0;

// Generatorfläche / Module
const MODULE_WIDTH_M = 1.134;   // Breite in m (vertikale Ausrichtung)
const MODULE_HEIGHT_M = 1.765;  // Höhe in m (vertikale Ausrichtung)
const GAP_M = 0.02;
const EDGE_M = 0.30;

let generatorHandles = null;    // [{x,y} * 4] Reihenfolge: unten links, unten rechts, oben rechts, oben links
let modules = [];               // Array von Modulen: [{corners:[{x,y}*4]}]
let draggingHandleIndex = -1;

// Dachhaut-Daten (Meter pro Ziegel)
const TILE_TYPES = {
    einfalz:  { w: 0.215, h: 0.33 },
    doppelfalz: { w: 0.30,  h: 0.33 },
    jumbo:   { w: 0.25,  h: 0.36 }
};

// --- Event-Handler --------------------------------------------------------

// Bild wählen
fileInput.addEventListener("change", handleImageChange);

// Polygon zurücksetzen
resetPolygonBtn.addEventListener("click", () => {
    points = [];
    isClosed = false;
    draggingPointIndex = -1;
    scaleReady = false;
    metersPerPixelX = 0;
    metersPerPixelY = 0;
    generatorHandles = null;
    modules = [];
    clearModulesBtn.disabled = true;
    updatePointInfo();
    updateMeasureInfo();
    draw();
});

// Eingegebene Referenzwerte -> Maßstab neu berechnen
roofTypeSelect.addEventListener("change", recalcScaleIfPossible);
tilesEaveInput.addEventListener("change", recalcScaleIfPossible);
tilesGableInput.addEventListener("change", recalcScaleIfPossible);

// Module einzeichnen / löschen
drawModulesBtn.addEventListener("click", () => {
    if (!scaleReady || !isClosed) {
        alert("Bitte zuerst Dachfläche schließen und Referenz (Dachhaut + Ziegelanzahlen) eingeben.");
        return;
    }
    createGeneratorAndModules();
    clearModulesBtn.disabled = false;
    draw();
});

clearModulesBtn.addEventListener("click", () => {
    generatorHandles = null;
    modules = [];
    clearModulesBtn.disabled = true;
    draw();
});

// Canvas Interaktion
canvas.addEventListener("mousedown", onMouseDown);
canvas.addEventListener("mousemove", onMouseMove);
canvas.addEventListener("mouseup", onMouseUp);
canvas.addEventListener("mouseleave", onMouseUp);

// --- Bild laden -----------------------------------------------------------

function handleImageChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            roofImage = img;

            // Canvas auf Bildgröße begrenzen (max 1200×600) und Bild passend skalieren
            let scale = Math.min(
                canvas.width / img.width,
                canvas.height / img.height
            );
            // kein globales scaling merken – wir zeichnen immer zentriert
            roofImage.scale = scale;
            draw();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Polygon-Interaktion --------------------------------------------------

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function onMouseDown(evt) {
    const pos = getMousePos(evt);

    // zuerst prüfen: Generator-Handle ziehen?
    if (generatorHandles) {
        const idx = findHandleIndex(pos, generatorHandles, 8);
        if (idx !== -1) {
            draggingHandleIndex = idx;
            return;
        }
    }

    // ansonsten: Polygon-Punkt ziehen oder neuen Punkt setzen
    const idx = findHandleIndex(pos, points, 8);
    if (idx !== -1) {
        draggingPointIndex = idx;
        return;
    }

    // neuer Punkt nur, wenn Polygon noch nicht geschlossen
    if (!isClosed) {
        points.push(pos);
        updatePointInfo();

        // Prüfen, ob letzter Punkt nahe genug am ersten ist -> Polygon schließen
        if (points.length >= 3) {
            const first = points[0];
            const dist = distance(pos, first);
            if (dist < 15) {
                // letzten Punkt auf den ersten schnappen lassen
                points[points.length - 1] = { x: first.x, y: first.y };
                isClosed = true;
                recalcScaleIfPossible();
            }
        }
        draw();
    }
}

function onMouseMove(evt) {
    const pos = getMousePos(evt);

    if (draggingPointIndex !== -1) {
        points[draggingPointIndex] = pos;
        draw();
        recalcScaleIfPossible();
        return;
    }

    if (draggingHandleIndex !== -1 && generatorHandles) {
        generatorHandles[draggingHandleIndex] = pos;
        recomputeModules();
        draw();
    }
}

function onMouseUp() {
    draggingPointIndex = -1;
    draggingHandleIndex = -1;
}

function findHandleIndex(pos, arr, radius) {
    for (let i = 0; i < arr.length; i++) {
        if (distance(pos, arr[i]) <= radius) {
            return i;
        }
    }
    return -1;
}

// --- Maßstab & Flächenberechnung -----------------------------------------

function recalcScaleIfPossible() {
    if (!isClosed) {
        scaleReady = false;
        updateMeasureInfo();
        return;
    }
    const type = roofTypeSelect.value;
    const tileSpec = TILE_TYPES[type];
    const tilesEave = Number(tilesEaveInput.value);
    const tilesGable = Number(tilesGableInput.value);

    if (!tileSpec || !tilesEave || !tilesGable) {
        scaleReady = false;
        updateMeasureInfo();
        return;
    }

    // Annahme:
    // Punkt 0 -> unten links
    // Punkt 1 -> unten rechts (Traufe)
    // letzter Punkt -> oben links (Ortgang)
    const p0 = points[0];
    const p1 = points[1];
    const pLast = points[points.length - 2]; // vorletzter ist i.d.R. oben links

    const pixelEave = distance(p0, p1);
    const pixelGable = distance(p0, pLast);

    const meterEave = tilesEave * tileSpec.w;
    const meterGable = tilesGable * tileSpec.h;

    metersPerPixelX = meterEave / pixelEave;
    metersPerPixelY = meterGable / pixelGable;

    const area = meterEave * meterGable;

    scaleReady = true;
    updateMeasureInfo(meterEave, meterGable, area);
}

function updateMeasureInfo(mEave, mGable, area) {
    if (!scaleReady || mEave === undefined) {
        measureInfo.textContent = "Traufe: – m, Ortgang: – m, Fläche: – m²";
        return;
    }
    measureInfo.textContent =
        `Traufe: ${mEave.toFixed(2)} m, Ortgang: ${mGable.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;
}

// --- Generatorfläche & Module ---------------------------------------------

function createGeneratorAndModules() {
    // Start-Generator als rechteckige Fläche in der Mitte des Polygons (grobe Annahme)

    // einfache Bounding-Box des Polygons
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }

    const marginPxX = EDGE_M / metersPerPixelX;
    const marginPxY = EDGE_M / metersPerPixelY;

    minX += marginPxX;
    maxX -= marginPxX;
    minY += marginPxY;
    maxY -= marginPxY;

    const pBL = { x: minX, y: maxY }; // bottom left
    const pBR = { x: maxX, y: maxY }; // bottom right
    const pTR = { x: maxX, y: minY }; // top right
    const pTL = { x: minX, y: minY }; // top left

    generatorHandles = [pBL, pBR, pTR, pTL];
    recomputeModules();
}

function recomputeModules() {
    if (!generatorHandles) return;

    const [pBL, pBR, pTR, pTL] = generatorHandles;

    // Längen der Ränder in Pixel
    const lenBottomPx = distance(pBL, pBR);
    const lenLeftPx = distance(pBL, pTL);

    const lenBottomM = lenBottomPx * metersPerPixelX;
    const lenLeftM = lenLeftPx * metersPerPixelY;

    // Modulmaße je nach Ausrichtung
    const orientation = orientationSelect.value;
    let modW = MODULE_WIDTH_M;
    let modH = MODULE_HEIGHT_M;
    if (orientation === "horizontal") {
        [modW, modH] = [modH, modW];
    }

    const effBottomM = lenBottomM - 2 * EDGE_M;
    const effLeftM = lenLeftM - 2 * EDGE_M;

    const cellW = modW + GAP_M;
    const cellH = modH + GAP_M;

    const countX = Math.max(0, Math.floor((effBottomM + GAP_M) / cellW));
    const countY = Math.max(0, Math.floor((effLeftM + GAP_M) / cellH));

    modules = [];

    if (countX === 0 || countY === 0) {
        moduleInfo.textContent =
            "Keine Module passen in die aktuelle Generatorfläche (zu klein bei gewählten Parametern).";
        return;
    }

    moduleInfo.textContent =
        `Module: ${countX} × ${countY} = ${countX * countY} Stück`;

    // Wir parametrisieren die Generatorfläche in s (0..1, horizontal) und t (0..1, vertikal)
    // Eckpunkte in Reihenfolge BL, BR, TR, TL

    function lerpHandle(s, t) {
        // bilineare Interpolation
        const x =
            pBL.x * (1 - s) * (1 - t) +
            pBR.x * s * (1 - t) +
            pTR.x * s * t +
            pTL.x * (1 - s) * t;
        const y =
            pBL.y * (1 - s) * (1 - t) +
            pBR.y * s * (1 - t) +
            pTR.y * s * t +
            pTL.y * (1 - s) * t;
        return { x, y };
    }

    const totalGridW = countX * cellW - GAP_M;
    const totalGridH = countY * cellH - GAP_M;

    for (let iy = 0; iy < countY; iy++) {
        for (let ix = 0; ix < countX; ix++) {
            // Meterposition der Modul-Ecken (ohne Randabstand, der steckt im Generator)
            const xStartM = EDGE_M + ix * cellW;
            const yStartM = EDGE_M + iy * cellH;

            const xEndM = xStartM + modW;
            const yEndM = yStartM + modH;

            const s0 = xStartM / (totalGridW + 2 * EDGE_M - GAP_M);
            const s1 = xEndM / (totalGridW + 2 * EDGE_M - GAP_M);
            const t0 = yStartM / (totalGridH + 2 * EDGE_M - GAP_M);
            const t1 = yEndM / (totalGridH + 2 * EDGE_M - GAP_M);

            const c0 = lerpHandle(s0, t1); // unten links
            const c1 = lerpHandle(s1, t1); // unten rechts
            const c2 = lerpHandle(s1, t0); // oben rechts
            const c3 = lerpHandle(s0, t0); // oben links

            modules.push({ corners: [c0, c1, c2, c3] });
        }
    }
}

// --- Zeichnen --------------------------------------------------------------

function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    if (roofImage) {
        const img = roofImage;
        const scale = img.scale || 1;

        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;

        const x = (canvas.width - drawWidth) / 2;
        const y = (canvas.height - drawHeight) / 2;

        ctx.drawImage(img, x, y, drawWidth, drawHeight);
    } else {
        ctx.fillStyle = "#999";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
}

function drawPolygon() {
    if (points.length === 0) return;

    ctx.save();
    ctx.lineWidth = 2;

    // Fläche
    if (isClosed) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.fill();
    }

    // Linien
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    if (isClosed) ctx.closePath();
    ctx.strokeStyle = "red";
    ctx.stroke();

    // Punkte
    for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "red";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.stroke();
    }

    ctx.restore();
}

function drawGenerator() {
    if (!generatorHandles) return;

    const alpha = Number(moduleOpacityInput.value);

    // Generatorrahmen
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(generatorHandles[0].x, generatorHandles[0].y);
    for (let i = 1; i < generatorHandles.length; i++) {
        ctx.lineTo(generatorHandles[i].x, generatorHandles[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Handles
    for (const h of generatorHandles) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "cyan";
        ctx.fill();
        ctx.strokeStyle = "#003";
        ctx.stroke();
    }

    // Module
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(80,80,80,1)";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;

    for (const m of modules) {
        const c = m.corners;
        ctx.beginPath();
        ctx.moveTo(c[0].x, c[0].y);
        ctx.lineTo(c[1].x, c[1].y);
        ctx.lineTo(c[2].x, c[2].y);
        ctx.lineTo(c[3].x, c[3].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

function draw() {
    drawBackground();
    drawPolygon();
    drawGenerator();
}

function updatePointInfo() {
    pointInfo.textContent = `Punkte: ${points.length}`;
}

// --- Hilfsfunktionen ------------------------------------------------------

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Initialer Draw
draw();
updatePointInfo();
updateMeasureInfo();
