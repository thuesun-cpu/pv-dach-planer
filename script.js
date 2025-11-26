const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tileTraufe = document.getElementById("tilesTraufe");
const tileOrtgang = document.getElementById("tilesOrtgang");
const info = document.getElementById("info");
const transparencyInput = document.getElementById("moduleTransparency");

let image = null;
let polygonPoints = [];
let closed = false;
let isDragging = false;
let dragIndex = -1;
let generatorArea = null;
let moduleTransparency = 0;

fileInput.addEventListener("change", handleImage);
canvas.addEventListener("mousedown", onMouseDown);
canvas.addEventListener("mousemove", onMouseMove);
canvas.addEventListener("mouseup", () => isDragging = false);
transparencyInput.addEventListener("input", () => {
    moduleTransparency = parseFloat(transparencyInput.value);
    drawCanvas();
});

function handleImage() {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        image = new Image();
        image.onload = () => {
            canvas.width = image.width;
            canvas.height = image.height;
            reset();
        };
        image.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!closed) {
        if (
            polygonPoints.length >= 3 &&
            distance(x, y, polygonPoints[0].x, polygonPoints[0].y) < 10
        ) {
            closed = true;
            updateMeasurements();
            drawCanvas();
            return;
        }
        polygonPoints.push({ x, y });
        drawCanvas();
    } else {
        for (let i = 0; i < polygonPoints.length; i++) {
            if (distance(x, y, polygonPoints[i].x, polygonPoints[i].y) < 10) {
                isDragging = true;
                dragIndex = i;
                return;
            }
        }
    }
}

function onMouseMove(e) {
    if (!isDragging || dragIndex === -1) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    polygonPoints[dragIndex] = { x, y };
    drawCanvas();
    updateMeasurements();
}

function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function reset() {
    polygonPoints = [];
    closed = false;
    isDragging = false;
    dragIndex = -1;
    generatorArea = null;
    drawCanvas();
    updateMeasurements();
}

function updateMeasurements() {
    if (!closed || polygonPoints.length < 4) {
        info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
        return;
    }

    const traufePx = distance(
        polygonPoints[0].x, polygonPoints[0].y,
        polygonPoints[1].x, polygonPoints[1].y
    );
    const ortgangPx = distance(
        polygonPoints[0].x, polygonPoints[0].y,
        polygonPoints[3].x, polygonPoints[3].y
    );

    const traufeTiles = parseInt(tileTraufe.value);
    const ortgangTiles = parseInt(tileOrtgang.value);

    const traufeM = getTileWidth(tileType.value) * traufeTiles / 100;
    const ortgangM = getTileHeight(tileType.value) * ortgangTiles / 100;

    const scaleX = traufeM / traufePx;
    const scaleY = ortgangM / ortgangPx;
    const scale = (scaleX + scaleY) / 2;

    const areaPx = Math.abs(
        polygonPoints[0].x * polygonPoints[1].y +
        polygonPoints[1].x * polygonPoints[2].y +
        polygonPoints[2].x * polygonPoints[3].y +
        polygonPoints[3].x * polygonPoints[0].y -
        polygonPoints[1].x * polygonPoints[0].y -
        polygonPoints[2].x * polygonPoints[1].y -
        polygonPoints[3].x * polygonPoints[2].y -
        polygonPoints[0].x * polygonPoints[3].y
    ) / 2;

    const areaM2 = areaPx * scale * scale;

    info.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;

    // Generatorfläche automatisch setzen nach Schließen
    generatorArea = {
        x: polygonPoints[0].x + scale * 0.3,
        y: polygonPoints[0].y + scale * 0.3,
        width: traufePx - scale * 0.6,
        height: ortgangPx - scale * 0.3
    };

    drawCanvas();
}

function getTileWidth(type) {
    switch (type) {
        case "21x33": return 21;
        case "24x40": return 24;
        case "30x33": return 30;
        case "30x40": return 30;
        default: return 30;
    }
}

function getTileHeight(type) {
    switch (type) {
        case "21x33": return 33;
        case "24x40": return 40;
        case "30x33": return 33;
        case "30x40": return 40;
        default: return 40;
    }
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image) ctx.drawImage(image, 0, 0);

    if (polygonPoints.length > 0) {
        ctx.strokeStyle = "lime";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
        for (let i = 1; i < polygonPoints.length; i++) {
            ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
        }
        if (closed) ctx.lineTo(polygonPoints[0].x, polygonPoints[0].y);
        ctx.stroke();

        // Ziehpunkte
        ctx.fillStyle = "cyan";
        polygonPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    if (closed && generatorArea) {
        drawModules();
    }
}

function drawModules() {
    if (!generatorArea) return;

    const moduleWidth = 113.4;
    const moduleHeight = 176.5;
    const moduleGap = 2;

    const traufePx = distance(polygonPoints[0].x, polygonPoints[0].y, polygonPoints[1].x, polygonPoints[1].y);
    const ortgangPx = distance(polygonPoints[0].x, polygonPoints[0].y, polygonPoints[3].x, polygonPoints[3].y);
    const traufeM = getTileWidth(tileType.value) * parseInt(tileTraufe.value) / 100;
    const ortgangM = getTileHeight(tileType.value) * parseInt(tileOrtgang.value) / 100;
    const scaleX = traufeM / traufePx;
    const scaleY = ortgangM / ortgangPx;
    const scale = (scaleX + scaleY) / 2;

    const moduleTotalW = moduleWidth + moduleGap;
    const moduleTotalH = moduleHeight + moduleGap;

    const cols = Math.floor((traufeM - 0.3) / (moduleTotalW / 100));
    const rows = Math.floor((ortgangM - 0.3) / (moduleTotalH / 100));

    const startX = polygonPoints[0].x + scale * 30; // 30 cm
    const startY = polygonPoints[0].y + scale * 30;

    ctx.globalAlpha = 1 - moduleTransparency;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = startX + col * (scale * moduleTotalW / 100);
            const y = startY + row * (scale * moduleTotalH / 100);
            const w = scale * moduleWidth / 100;
            const h = scale * moduleHeight / 100;

            ctx.fillStyle = "black";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "white";
            ctx.strokeRect(x, y, w, h);
        }
    }
    ctx.globalAlpha = 1;
}
