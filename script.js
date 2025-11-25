// --- Canvas & DOM-Elemente --------------------------------------------------

const canvas = document.getElementById("polygonCanvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const resetPolygonBtn = document.getElementById("resetBtn");

const dachtypSelect = document.getElementById("dachtyp");
const tilesTraufeInput = document.getElementById("ziegelTraufe");
const tilesOrtgangInput = document.getElementById("ziegelOrtgang");
const infoText = document.getElementById("measureInfo");

const orientationSelect = document.getElementById("ausrichtung");
const opacityRange = document.getElementById("modOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");
const moduleInfo = document.getElementById("moduleInfo");
const pointsInfo = document.getElementById("pointCount");


// --- Bild --------------------------------------------------------------------

const image = new Image();
let imageLoaded = false;
let scale = 1;
let offsetX = 0;
let offsetY = 0;

// --- Polygon (Dachfläche) ---------------------------------------------------

let polygon = [];          // [{x,y}, ...] in Canvas-Koordinaten
let polygonClosed = false;
let draggingPolygonIndex = -1;

// --- Generatorfläche / Module -----------------------------------------------

let generatorQuad = null;  // [{x,y}, ...] 4 Ecken in Reihenfolge: TL, TR, BR, BL
let draggingGeneratorIndex = -1;

let moduleRows = 0;
let moduleCols = 0;

const MODULE_W_VERT = 1.134; // m (Breite bei vertikal)
const MODULE_H_VERT = 1.765; // m (Höhe bei vertikal)
const GAP_M = 0.02;          // Fuge zwischen Modulen (m)
const MARGIN_M = 0.30;       // Rand zur Dachkante (m)

let traufeM = 0;   // reale Länge Traufe (m)
let ortgangM = 0;  // reale Länge Ortgang (m)
let areaRoofM2 = 0;

let isMouseDown = false;
const HANDLE_RADIUS = 8;

// --- Hilfsfunktionen --------------------------------------------------------

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left),
    y: (evt.clientY - rect.top),
  };
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function findHandleIndex(points, pos, radius) {
  if (!points) return -1;
  for (let i = 0; i < points.length; i++) {
    if (distance(points[i], pos) <= radius) return i;
  }
  return -1;
}

// --- Bild laden und an Canvas anpassen --------------------------------------

function fitCanvasToImage() {
  const maxWidth = 1200;
  const maxHeight = 700;

  let w = image.width;
  let h = image.height;

  const scaleW = maxWidth / w;
  const scaleH = maxHeight / h;
  scale = Math.min(scaleW, scaleH, 1);

  canvas.width = w * scale;
  canvas.height = h * scale;

  offsetX = 0;
  offsetY = 0;
}

function drawImage() {
  if (!imageLoaded) {
    ctx.fillStyle = "#eee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.drawImage(image, 0, 0, image.width * scale, image.height * scale);
}

// --- Zeichnen ---------------------------------------------------------------

function drawPolygon() {
  if (polygon.length === 0) return;

  // Polygon-Linien
  ctx.lineWidth = 2;
  ctx.strokeStyle = "red";
  ctx.fillStyle = "rgba(255,0,0,0.03)";

  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  if (polygonClosed) {
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();

  // Eckpunkte
  ctx.fillStyle = "#00bcd4";
  polygon.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGeneratorAndModules() {
  if (!generatorQuad || moduleRows <= 0 || moduleCols <= 0) return;

  const alpha = parseFloat(opacityRange.value) || 0.5;

  // Generatorfläche einfärben
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(80,80,80,0.7)";
  ctx.fill();

  // Modulraster (weiße Linien)
  ctx.globalAlpha = alpha + 0.2;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;

  // Reihen entlang Ortgang (Höhe), Spalten entlang Traufe (Länge)
  const q0 = generatorQuad[0]; // TL
  const q1 = generatorQuad[1]; // TR
  const q2 = generatorQuad[2]; // BR
  const q3 = generatorQuad[3]; // BL

  for (let r = 0; r < moduleRows; r++) {
    const t0 = r / moduleRows;
    const t1 = (r + 1) / moduleRows;

    const left0 = lerp(q0, q3, t0);
    const right0 = lerp(q1, q2, t0);
    const left1 = lerp(q0, q3, t1);
    const right1 = lerp(q1, q2, t1);

    for (let c = 0; c < moduleCols; c++) {
      const s0 = c / moduleCols;
      const s1 = (c + 1) / moduleCols;

      const a = lerp(left0, right0, s0);
      const b = lerp(left0, right0, s1);
      const d = lerp(left1, right1, s0);
      const e = lerp(left1, right1, s1);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.restore();

  // Ziehpunkte der Generatorfläche
  ctx.fillStyle = "#00ff7f";
  generatorQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
}

function redraw() {
  drawImage();
  drawPolygon();
  drawGeneratorAndModules();
}

// --- Maße berechnen ---------------------------------------------------------

function getTileSizeFromSelection() {
  // Rückgabe: {traufeM, ortgangM} pro Ziegel
  const value = dachtypSelect.value;
  switch (value) {
    case "einfalzziegel":
      return { traufe: 0.215, ortgang: 0.33 };
    case "doppelFalz":
      return { traufe: 0.30, ortgang: 0.33 };
    case "jumbo":
      return { traufe: 0.25, ortgang: 0.36 };
    default:
      return null;
  }
}

function updateRoofMeasurements() {
  if (!polygonClosed || polygon.length < 4) {
    infoText.textContent = "Traufe: – m, Ortgang: – m, Fläche: – m²";
    return;
  }

  const tileSize = getTileSizeFromSelection();
  const tilesTraufe = parseInt(tilesTraufeInput.value, 10);
  const tilesOrtgang = parseInt(tilesOrtgangInput.value, 10);

  if (!tileSize || !tilesTraufe || !tilesOrtgang) {
    infoText.textContent = "Traufe: – m, Ortgang: – m, Fläche: – m²";
    return;
  }

  traufeM = tilesTraufe * tileSize.traufe;
  ortgangM = tilesOrtgang * tileSize.ortgang;

  // Annahme: Punkt 0 = Traufe links, Punkt 1 = Traufe rechts, Punkt 3 = Ortgang oben links
  const traufePx = distance(polygon[0], polygon[1]);
  const ortgangPx = distance(polygon[0], polygon[3]);

  const scaleTraufe = traufePx > 0 ? traufeM / traufePx : 0;
  const scaleOrtgang = ortgangPx > 0 ? ortgangM / ortgangPx : 0;
  const mPerPx = (scaleTraufe + scaleOrtgang) / 2;

  const areaPx = polygonArea(polygon);
  areaRoofM2 = mPerPx > 0 ? areaPx * mPerPx * mPerPx : 0;

  infoText.textContent =
    `Traufe: ${traufeM.toFixed(2)} m, ` +
    `Ortgang: ${ortgangM.toFixed(2)} m, ` +
    `Fläche: ${areaRoofM2.toFixed(2)} m²`;
}

// --- Generatorfläche & Modulanzahl ------------------------------------------

function computeModuleCounts() {
  if (!traufeM || !ortgangM) {
    moduleInfo.textContent = "Bitte zuerst Dachhaut und Ziegelanzahl setzen.";
    moduleRows = 0;
    moduleCols = 0;
    return;
  }

  const orientation = orientationSelect.value; // "vertical" | "horizontal"

  let moduleW = MODULE_W_VERT;
  let moduleH = MODULE_H_VERT;

  if (orientation === "horizontal") {
    // Quer verlegt: Seiten tauschen
    [moduleW, moduleH] = [moduleH, moduleW];
  }

  const usableTraufe = traufeM - 2 * MARGIN_M;
  const usableOrtgang = ortgangM - 2 * MARGIN_M;

  if (usableTraufe <= 0 || usableOrtgang <= 0) {
    moduleInfo.textContent = "Zu wenig Platz (Rand 0,30 m berücksichtigt).";
    moduleRows = 0;
    moduleCols = 0;
    return;
  }

  moduleCols = Math.floor((usableTraufe + GAP_M) / (moduleW + GAP_M));
  moduleRows = Math.floor((usableOrtgang + GAP_M) / (moduleH + GAP_M));

  if (moduleCols <= 0 || moduleRows <= 0) {
    moduleInfo.textContent = "Kein Platz für Module mit Rand und Fuge.";
    moduleRows = 0;
    moduleCols = 0;
    return;
  }

  moduleInfo.textContent =
    `Modul: ${moduleH.toFixed(3)} x ${moduleW.toFixed(3)} m, ` +
    `Fuge ${GAP_M.toFixed(2)} m, Rand ${MARGIN_M.toFixed(2)} m, ` +
    `Reihen: ${moduleRows}, Spalten: ${moduleCols}`;
}

// Generator-Quad initial innerhalb des Polygons / Bounding Box platzieren
function createDefaultGeneratorQuad() {
  if (!polygonClosed || polygon.length < 4) {
    generatorQuad = null;
    return;
  }

  // einfache Bounding-Box des Polygons
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  polygon.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  // Rand in Pixel grob aus Metern ableiten
  const traufePx = distance(polygon[0], polygon[1]);
  const ortgangPx = distance(polygon[0], polygon[3]);
  const pxPerM_traufe = traufePx / (traufeM || 1);
  const pxPerM_ortgang = ortgangPx / (ortgangM || 1);
  const marginPxX = MARGIN_M * pxPerM_traufe;
  const marginPxY = MARGIN_M * pxPerM_ortgang;

  const tl = { x: minX + marginPxX, y: minY + marginPxY };
  const tr = { x: maxX - marginPxX, y: minY + marginPxY };
  const br = { x: maxX - marginPxX, y: maxY - marginPxY };
  const bl = { x: minX + marginPxX, y: maxY - marginPxY };

  generatorQuad = [tl, tr, br, bl];
}

// --- Events: Datei / Bild ---------------------------------------------------

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    image.onload = () => {
      imageLoaded = true;
      fitCanvasToImage();
      redraw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// --- Events: Maus -----------------------------------------------------------

canvas.addEventListener("mousedown", e => {
  if (!imageLoaded) return;
  const pos = getMousePos(e);
  isMouseDown = true;

  // 1) Zuerst Generator-Handles prüfen
  if (generatorQuad) {
    const idx = findHandleIndex(generatorQuad, pos, HANDLE_RADIUS + 4);
    if (idx >= 0) {
      draggingGeneratorIndex = idx;
      return;
    }
  }

  // 2) Polygon-Handles prüfen
  const polyIdx = findHandleIndex(polygon, pos, HANDLE_RADIUS + 4);
  if (polyIdx >= 0) {
    draggingPolygonIndex = polyIdx;
    return;
  }

  // 3) Neues Polygon-Vertex setzen (solange nicht geschlossen)
  if (!polygonClosed) {
    if (polygon.length >= 3 && distance(pos, polygon[0]) < HANDLE_RADIUS + 4) {
      polygonClosed = true;
      updateRoofMeasurements();
    } else {
      polygon.push(pos);
      pointsInfo.textContent = polygon.length.toString();
    }
    redraw();
  }
});

canvas.addEventListener("mousemove", e => {
  if (!isMouseDown) return;
  const pos = getMousePos(e);

  if (draggingPolygonIndex >= 0) {
    polygon[draggingPolygonIndex] = pos;
    if (polygonClosed) updateRoofMeasurements();
    redraw();
  } else if (draggingGeneratorIndex >= 0 && generatorQuad) {
    generatorQuad[draggingGeneratorIndex] = pos;
    redraw();
  }
});

canvas.addEventListener("mouseup", () => {
  isMouseDown = false;
  draggingPolygonIndex = -1;
  draggingGeneratorIndex = -1;
});

canvas.addEventListener("mouseleave", () => {
  isMouseDown = false;
  draggingPolygonIndex = -1;
  draggingGeneratorIndex = -1;
});

// --- Buttons ---------------------------------------------------------------

resetPolygonBtn.addEventListener("click", () => {
  polygon = [];
  polygonClosed = false;
  generatorQuad = null;
  moduleRows = 0;
  moduleCols = 0;
  pointsInfo.textContent = "0";
  infoText.textContent = "Traufe: – m, Ortgang: – m, Fläche: – m²";
  moduleInfo.textContent =
    "Modul: 1,765 x 1,134 m, Fuge 0,02 m, Rand 0,30 m, Reihen: –, Spalten: –";
  redraw();
});

drawModulesBtn.addEventListener("click", () => {
  if (!polygonClosed || polygon.length < 4) {
    alert("Bitte zuerst das Dach-Polygon vollständig schließen.");
    return;
  }

  updateRoofMeasurements();
  computeModuleCounts();
  if (moduleRows <= 0 || moduleCols <= 0) {
    redraw();
    return;
  }

  if (!generatorQuad) {
    createDefaultGeneratorQuad();
  }

  redraw();
});

clearModulesBtn.addEventListener("click", () => {
  generatorQuad = null;
  moduleRows = 0;
  moduleCols = 0;
  moduleInfo.textContent =
    "Modul: 1,765 x 1,134 m, Fuge 0,02 m, Rand 0,30 m, Reihen: –, Spalten: –";
  redraw();
});

orientationSelect.addEventListener("change", () => {
  if (!polygonClosed) return;
  computeModuleCounts();
  redraw();
});

opacityRange.addEventListener("input", () => {
  redraw();
});

// --- Initialer Zustand ------------------------------------------------------

redraw();
