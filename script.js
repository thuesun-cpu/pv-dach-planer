// --- Konstanten ---
// Dachtypen in cm
const TILE_TYPES = {
  einfalz: { name: "Einfalzziegel 21,5 x 33 cm", w: 21.5, h: 33 },
  doppelfalz: { name: "Doppelfalzziegel / Betonstein 30 x 33 cm", w: 30, h: 33 },
  jumbo: { name: "Jumbo 25 x 36 cm", w: 25, h: 36 },
};

// Module in m
const MODULE_WIDTH = 1.134; // m
const MODULE_HEIGHT = 1.765; // m
const GAP = 0.02; // m
const EDGE_MARGIN = 0.3; // m

// --- DOM-Elemente ---
const fileInput = document.getElementById("fileInput");
const roofImage = document.getElementById("roofImage");
const polygonCanvas = document.getElementById("polygonCanvas");
const moduleCanvas = document.getElementById("moduleCanvas");
const resetBtn = document.getElementById("resetBtn");
const pointCountSpan = document.getElementById("pointCount");
const dachtypSelect = document.getElementById("dachtyp");
const ziegelTraufeInput = document.getElementById("ziegelTraufe");
const ziegelOrtgangInput = document.getElementById("ziegelOrtgang");
const measureInfo = document.getElementById("measureInfo");
const ausrichtungSelect = document.getElementById("ausrichtung");
const opacityInput = document.getElementById("modOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");
const moduleInfo = document.getElementById("moduleInfo");

const polyCtx = polygonCanvas.getContext("2d");
const modCtx = moduleCanvas.getContext("2d");

// --- Zustand ---
let imageLoaded = false;
let imgNaturalWidth = 0;
let imgNaturalHeight = 0;

let points = []; // Punkte im Bild-Koordinatensystem
let polygonClosed = false;

let scale = 1; // Canvas-Pixel pro Bild-Pixel (wird bei resize gesetzt)
let offsetX = 0;
let offsetY = 0;

let roofWidthM = null;
let roofHeightM = null;
let roofAreaM2 = null;

// --- Hilfsfunktionen ---

function resizeCanvasesToImage() {
  if (!imageLoaded) return;

  // sichtbare Breite des Bildes
  const wrapper = document.getElementById("canvasWrapper");
  const displayWidth = roofImage.clientWidth || wrapper.clientWidth;
  const displayHeight = imgNaturalHeight * (displayWidth / imgNaturalWidth);

  roofImage.style.width = displayWidth + "px";
  roofImage.style.height = displayHeight + "px";

  polygonCanvas.width = displayWidth;
  polygonCanvas.height = displayHeight;
  moduleCanvas.width = displayWidth;
  moduleCanvas.height = displayHeight;

  const rect = polygonCanvas.getBoundingClientRect();
  offsetX = rect.left;
  offsetY = rect.top;

  scale = displayWidth / imgNaturalWidth;

  redrawAll();
}

function imgToCanvas(pt) {
  // Bild-Koordinaten -> Canvas-Pixel
  return { x: pt.x * scale, y: pt.y * scale };
}

function canvasToImg(x, y) {
  // Canvas-Pixel -> Bild-Koordinaten
  return { x: x / scale, y: y / scale };
}

function distanceCanvas(a, b) {
  const ax = a.x * scale;
  const ay = a.y * scale;
  const bx = b.x * scale;
  const by = b.y * scale;
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function drawPolygon() {
  polyCtx.clearRect(0, 0, polygonCanvas.width, polygonCanvas.height);

  if (points.length === 0) return;

  polyCtx.lineWidth = 2;
  polyCtx.strokeStyle = "red";
  polyCtx.fillStyle = "rgba(255,0,0,0.15)";

  const first = imgToCanvas(points[0]);

  polyCtx.beginPath();
  polyCtx.moveTo(first.x, first.y);

  for (let i = 1; i < points.length; i++) {
    const p = imgToCanvas(points[i]);
    polyCtx.lineTo(p.x, p.y);
  }

  if (polygonClosed) {
    polyCtx.closePath();
    polyCtx.fill();
  }

  polyCtx.stroke();

  // Punkte
  polyCtx.fillStyle = "cyan";
  for (const p of points) {
    const cp = imgToCanvas(p);
    polyCtx.beginPath();
    polyCtx.arc(cp.x, cp.y, 4, 0, Math.PI * 2);
    polyCtx.fill();
  }
}

function updateMeasurements() {
  const dachKey = dachtypSelect.value;
  const traufeCount = parseFloat(ziegelTraufeInput.value);
  const ortgangCount = parseFloat(ziegelOrtgangInput.value);

  if (!dachKey || !TILE_TYPES[dachKey] || !traufeCount || !ortgangCount) {
    roofWidthM = roofHeightM = roofAreaM2 = null;
    measureInfo.textContent = "Traufe: – m, Ortgang: – m, Fläche: – m²";
    return;
  }

  const t = TILE_TYPES[dachKey];
  roofWidthM = (traufeCount * t.w) / 100; // m
  roofHeightM = (ortgangCount * t.h) / 100; // m
  roofAreaM2 = roofWidthM * roofHeightM;

  measureInfo.textContent =
    "Traufe: " +
    roofWidthM.toFixed(2) +
    " m, Ortgang: " +
    roofHeightM.toFixed(2) +
    " m, Fläche: " +
    roofAreaM2.toFixed(2) +
    " m²";

  // wenn Polygon geschlossen: Fläche in m² anhand Pixelmaß berechnen
  if (polygonClosed && points.length >= 3) {
    const scaleMPerPixel = roofWidthM / distanceCanvas(points[0], points[1]);
    const areaPixels = polygonAreaPixels();
    const areaM2 = areaPixels * Math.pow(scaleMPerPixel, 2);
    measureInfo.textContent += " (Polygon: " + areaM2.toFixed(2) + " m²)";
  }
}

function polygonAreaPixels() {
  // Shoelace im Bild-Koordinatensystem
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 2;
}

function redrawAll() {
  drawPolygon();
  drawModules();
}

// --- Modulraster ---

function drawModules() {
  modCtx.clearRect(0, 0, moduleCanvas.width, moduleCanvas.height);
  if (!polygonClosed || !roofWidthM || !roofHeightM) return;
  if (points.length < 3) return;

  const orientation = ausrichtungSelect.value; // "vertikal" | "horizontal"
  const opacity = parseFloat(opacityInput.value);

  const modW = orientation === "vertikal" ? MODULE_WIDTH : MODULE_HEIGHT;
  const modH = orientation === "vertikal" ? MODULE_HEIGHT : MODULE_WIDTH;

  const usableWidth = Math.max(roofWidthM - 2 * EDGE_MARGIN, 0);
  const usableHeight = Math.max(roofHeightM - 2 * EDGE_MARGIN, 0);

  const pitchCols = Math.floor(
    (usableWidth + GAP) / (modW + GAP)
  );
  const pitchRows = Math.floor(
    (usableHeight + GAP) / (modH + GAP)
  );

  if (pitchCols <= 0 || pitchRows <= 0) return;

  const totalModWidthM = pitchCols * modW + (pitchCols - 1) * GAP;
  const totalModHeightM = pitchRows * modH + (pitchRows - 1) * GAP;

  // Maßstab in m/Pixel entlang Traufe und Ortgang
  const scaleMPerPixelX = roofWidthM / distanceCanvas(points[0], points[1]);
  const scaleMPerPixelY = roofHeightM / distanceCanvas(points[1], points[2]);

  // Basisvektoren entlang Traufe und Ortgang (im Canvas)
  const p0 = imgToCanvas(points[0]);
  const p1 = imgToCanvas(points[1]);
  const p2 = imgToCanvas(points[2]);

  const vTraufe = {
    x: (p1.x - p0.x) / roofWidthM,
    y: (p1.y - p0.y) / roofWidthM,
  };
  const vOrtgang = {
    x: (p2.x - p1.x) / roofHeightM,
    y: (p2.y - p1.y) / roofHeightM,
  };

  const origin = {
    x:
      p0.x +
      vTraufe.x * EDGE_MARGIN +
      vOrtgang.x * EDGE_MARGIN,
    y:
      p0.y +
      vTraufe.y * EDGE_MARGIN +
      vOrtgang.y * EDGE_MARGIN,
  };

  modCtx.save();
  modCtx.globalAlpha = opacity;
  modCtx.strokeStyle = "white";
  modCtx.fillStyle = "rgba(80,80,80,1)";
  modCtx.lineWidth = 1;

  for (let r = 0; r < pitchRows; r++) {
    for (let c = 0; c < pitchCols; c++) {
      const offsetXM =
        c * (modW + GAP);
      const offsetYM =
        r * (modH + GAP);

      const base = {
        x: origin.x + vTraufe.x * offsetXM + vOrtgang.x * offsetYM,
        y: origin.y + vTraufe.y * offsetXM + vOrtgang.y * offsetYM,
      };

      const pA = base;
      const pB = {
        x: base.x + vTraufe.x * modW,
        y: base.y + vTraufe.y * modW,
      };
      const pD = {
        x: base.x + vOrtgang.x * modH,
        y: base.y + vOrtgang.y * modH,
      };
      const pC = {
        x: pB.x + vOrtgang.x * modH,
        y: pB.y + vOrtgang.y * modH,
      };

      modCtx.beginPath();
      modCtx.moveTo(pA.x, pA.y);
      modCtx.lineTo(pB.x, pB.y);
      modCtx.lineTo(pC.x, pC.y);
      modCtx.lineTo(pD.x, pD.y);
      modCtx.closePath();
      modCtx.fill();
      modCtx.stroke();
    }
  }

  modCtx.restore();

  moduleInfo.textContent =
    "Modul: " +
    MODULE_HEIGHT.toFixed(3) +
    " x " +
    MODULE_WIDTH.toFixed(3) +
    " m, Fuge " +
    GAP.toFixed(2) +
    " m, Rand " +
    EDGE_MARGIN.toFixed(2) +
    " m, Reihen: " +
    pitchRows +
    ", Spalten: " +
    pitchCols;
}

// --- Event-Handler ---

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  roofImage.onload = () => {
    imageLoaded = true;
    imgNaturalWidth = roofImage.naturalWidth;
    imgNaturalHeight = roofImage.naturalHeight;
    resizeCanvasesToImage();
  };
  roofImage.src = url;
});

window.addEventListener("resize", () => {
  if (imageLoaded) resizeCanvasesToImage();
});

polygonCanvas.addEventListener("click", (e) => {
  if (!imageLoaded) return;

  const x = e.clientX - offsetX;
  const y = e.clientY - offsetY;
  if (x < 0 || y < 0) return;

  const imgPt = canvasToImg(x, y);

  if (points.length >= 3) {
    const distToFirst = distanceCanvas(imgPt, points[0]);
    if (distToFirst < 10) {
      polygonClosed = true;
      redrawAll();
      updateMeasurements();
      return;
    }
  }

  if (polygonClosed) {
    // neue Fläche beginnen
    points = [];
    polygonClosed = false;
  }

  points.push(imgPt);
  pointCountSpan.textContent = points.length.toString();
  redrawAll();

  if (polygonClosed) updateMeasurements();
});

resetBtn.addEventListener("click", () => {
  points = [];
  polygonClosed = false;
  pointCountSpan.textContent = "0";
  polyCtx.clearRect(0, 0, polygonCanvas.width, polygonCanvas.height);
  modCtx.clearRect(0, 0, moduleCanvas.width, moduleCanvas.height);
});

dachtypSelect.addEventListener("change", updateMeasurements);
ziegelTraufeInput.addEventListener("input", updateMeasurements);
ziegelOrtgangInput.addEventListener("input", updateMeasurements);

opacityInput.addEventListener("input", () => {
  redrawAll();
});

drawModulesBtn.addEventListener("click", () => {
  if (!polygonClosed) return;
  drawModules();
  clearModulesBtn.disabled = false;
});

clearModulesBtn.addEventListener("click", () => {
  modCtx.clearRect(0, 0, moduleCanvas.width, moduleCanvas.height);
  clearModulesBtn.disabled = true;
});

// Initial
moduleInfo.textContent =
  "Modul: " +
  MODULE_HEIGHT +
  " x " +
  MODULE_WIDTH +
  " m, Fuge " +
  GAP +
  " m, Rand " +
  EDGE_MARGIN +
  " m";
