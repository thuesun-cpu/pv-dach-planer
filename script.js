// --- Setup
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufe = document.getElementById("tilesTraufe");
const tilesOrtgang = document.getElementById("tilesOrtgang");
const measurements = document.getElementById("measurements");
const opacitySlider = document.getElementById("moduleOpacity");

let image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;

let generatorQuad = null;
let draggingHandle = -1;
let isMouseDown = false;

const HANDLE_RADIUS = 6;
const MODULE_W = 1.134;   // m
const MODULE_H = 1.765;   // m
const GAP = 0.02;         // m
const MARGIN = 0.30;      // m

let moduleRows = 0;
let moduleCols = 0;

// --- Hilfsfunktionen
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum / 2);
}

// --- Zeichnen
function drawPolygon() {
  if (polygon.length === 0) return;

  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  if (polygonClosed) ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "lime";
  polygon.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawModules(quad, rows, cols, alpha) {
  if (!rows || !cols) return;
  const [tl, tr, br, bl] = quad;

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "white";
  ctx.fillStyle = "black";
  ctx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    const t0 = r / rows;
    const t1 = (r + 1) / rows;
    const left0 = lerp(tl, bl, t0);
    const right0 = lerp(tr, br, t0);
    const left1 = lerp(tl, bl, t1);
    const right1 = lerp(tr, br, t1);

    for (let c = 0; c < cols; c++) {
      const s0 = c / cols;
      const s1 = (c + 1) / cols;

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
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawGeneratorQuad() {
  if (!generatorQuad) return;

  const alpha = parseFloat(opacitySlider.value);
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawModules(generatorQuad, moduleRows, moduleCols, alpha);

  ctx.fillStyle = "lime";
  generatorQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
}

function redraw() {
  if (!imageLoaded) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawPolygon();
  drawGeneratorQuad();
}

// --- Event: Klick für Polygon setzen
canvas.addEventListener("click", function (evt) {
  if (!imageLoaded || polygonClosed) return;
  const pos = getMousePos(evt);

  if (polygon.length >= 3 && distance(polygon[0], pos) < 10) {
    polygonClosed = true;
    updateGenerator();
    redraw();
    return;
  }

  polygon.push(pos);
  redraw();
});

// --- Ziehen von Generatorpunkten
canvas.addEventListener("mousedown", function (evt) {
  if (!generatorQuad) return;
  const pos = getMousePos(evt);
  for (let i = 0; i < generatorQuad.length; i++) {
    if (distance(pos, generatorQuad[i]) < HANDLE_RADIUS + 2) {
      draggingHandle = i;
      isMouseDown = true;
      return;
    }
  }
});
canvas.addEventListener("mousemove", function (evt) {
  if (!isMouseDown || draggingHandle < 0) return;
  const pos = getMousePos(evt);
  generatorQuad[draggingHandle] = pos;
  redraw();
});
canvas.addEventListener("mouseup", () => {
  isMouseDown = false;
  draggingHandle = -1;
});

// --- Bild laden
fileInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    image.onload = () => {
      imageLoaded = true;
      canvas.width = image.width;
      canvas.height = image.height;
      redraw();
    };
    image.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

// --- Generator berechnen
function updateGenerator() {
  const traufeN = parseInt(tilesTraufe.value);
  const ortgangN = parseInt(tilesOrtgang.value);
  let tileW = 0, tileH = 0;

  switch (tileType.value) {
    case "Einfalzziegel 21x33 cm":
      tileW = 0.21; tileH = 0.33; break;
    case "Einfalz Jumbo 25x40 cm":
      tileW = 0.25; tileH = 0.40; break;
    case "Doppelfalz 30x33 cm":
      tileW = 0.30; tileH = 0.33; break;
    case "Doppelfalz Jumbo 30x40 cm":
      tileW = 0.30; tileH = 0.40; break;
    default:
      return;
  }

  const traufeM = traufeN * tileW;
  const ortgangM = ortgangN * tileH;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[3]);
  const pxPerM_T = pxTraufe / traufeM;
  const pxPerM_O = pxOrtgang / ortgangM;
  const pxPerM = (pxPerM_T + pxPerM_O) / 2;

  const marginX = pxPerM * MARGIN;
  const marginY = pxPerM * MARGIN;

  // Punkte: 0 = OL, 1 = OR, 2 = UR, 3 = UL
  const tl = {
    x: polygon[3].x + marginX,
    y: polygon[3].y + marginY
  };
  const tr = {
    x: polygon[2].x - marginX,
    y: polygon[2].y + marginY
  };
  const br = {
    x: polygon[1].x - marginX,
    y: polygon[1].y - marginY
  };
  const bl = {
    x: polygon[0].x + marginX,
    y: polygon[0].y - marginY
  };

  generatorQuad = [tl, tr, br, bl];

  // Modulanzahl berechnen
  const usableW = traufeM - 2 * MARGIN;
  const usableH = ortgangM - MARGIN; // nur oben mit Rand

  moduleCols = Math.floor((usableW + GAP) / (MODULE_W + GAP));
  moduleRows = Math.floor((usableH + GAP) / (MODULE_H + GAP));

  const areaPx = polygonArea(polygon);
  const areaM2 = (areaPx / (pxPerM * pxPerM)).toFixed(2);

  measurements.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2} m²`;
}

// --- Transparenz Slider
opacitySlider.addEventListener("input", () => {
  redraw();
});
