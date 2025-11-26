const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const resetBtn = document.getElementById("resetBtn");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const modOpacity = document.getElementById("modOpacity");
const infoText = document.getElementById("infoText");

let image = new Image();
let polygon = [];
let polygonClosed = false;
let generatorQuad = null;
let draggingIndex = -1;
let isDragging = false;

let traufeM = 0;
let ortgangM = 0;

let moduleCols = 0;
let moduleRows = 0;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;
const HANDLE_RADIUS = 6;

const TILE_SIZES = {
  einfalz: { t: 0.21, o: 0.33 },
  einfalz_jumbo: { t: 0.25, o: 0.36 },
  doppelfalz: { t: 0.30, o: 0.33 },
  doppelfalz_jumbo: { t: 0.30, o: 0.38 }
};

canvas.addEventListener("mousedown", (e) => {
  const pos = getMouse(e);
  if (!polygonClosed) {
    if (polygon.length >= 3 && distance(pos, polygon[0]) < HANDLE_RADIUS + 2) {
      polygonClosed = true;
      updateRoofMeasurements();
    } else {
      polygon.push(pos);
    }
  } else {
    draggingIndex = findHandleIndex(generatorQuad, pos);
    if (draggingIndex !== -1) {
      isDragging = true;
    }
  }
  draw();
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging || draggingIndex === -1) return;
  const pos = getMouse(e);
  generatorQuad[draggingIndex] = pos;
  draw();
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  draggingIndex = -1;
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    image.onload = () => draw();
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

resetBtn.addEventListener("click", () => {
  polygon = [];
  polygonClosed = false;
  generatorQuad = null;
  moduleCols = 0;
  moduleRows = 0;
  infoText.textContent = "Traufe: –, Ortgang: –, Fläche: –";
  draw();
});

drawModulesBtn.addEventListener("click", () => {
  if (!polygonClosed || polygon.length < 4) {
    alert("Dachfläche zuerst vollständig markieren.");
    return;
  }
  updateRoofMeasurements();
  computeModuleCounts();
  if (!generatorQuad) createGeneratorQuad();
  draw();
});

modOpacity.addEventListener("input", draw);

function getMouse(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (image.src) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (polygon.length) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    polygon.forEach(p => ctx.lineTo(p.x, p.y));
    if (polygonClosed) ctx.closePath();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawHandles(polygon);

  if (generatorQuad) {
    drawGeneratorQuad();
    drawModules();
  }
}

function drawHandles(points) {
  ctx.fillStyle = "cyan";
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGeneratorQuad() {
  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  generatorQuad.forEach((p, i) => i && ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();
  ctx.strokeStyle = "green";
  ctx.stroke();

  drawHandles(generatorQuad);
}

function drawModules() {
  if (!moduleCols || !moduleRows || !generatorQuad) return;

  const alpha = parseFloat(modOpacity.value);
  ctx.save();
  ctx.globalAlpha = alpha;

  const [tl, tr, br, bl] = generatorQuad;

  for (let r = 0; r < moduleRows; r++) {
    const t0 = r / moduleRows;
    const t1 = (r + 1) / moduleRows;
    const leftTop = lerp(tl, bl, t0);
    const rightTop = lerp(tr, br, t0);
    const leftBottom = lerp(tl, bl, t1);
    const rightBottom = lerp(tr, br, t1);

    for (let c = 0; c < moduleCols; c++) {
      const s0 = c / moduleCols;
      const s1 = (c + 1) / moduleCols;

      const a = lerp(leftTop, rightTop, s0);
      const b = lerp(leftTop, rightTop, s1);
      const d = lerp(leftBottom, rightBottom, s0);
      const e = lerp(leftBottom, rightBottom, s1);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();

      ctx.fillStyle = "black";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function findHandleIndex(points, pos) {
  return points.findIndex(p => distance(p, pos) < HANDLE_RADIUS + 2);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum / 2);
}

function updateRoofMeasurements() {
  const type = tileType.value;
  const t = TILE_SIZES[type];
  const tra = parseInt(tilesTraufeInput.value);
  const ort = parseInt(tilesOrtgangInput.value);
  if (!t || !tra || !ort) return;

  traufeM = tra * t.t;
  ortgangM = ort * t.o;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[3]);

  const scaleT = traufeM / pxTraufe;
  const scaleO = ortgangM / pxOrtgang;
  const scale = (scaleT + scaleO) / 2;

  const area = polygonArea(polygon) * scale * scale;

  infoText.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;
}

function computeModuleCounts() {
  moduleCols = Math.floor((traufeM - 2 * MARGIN + GAP) / (MODULE_W + GAP));
  moduleRows = Math.floor((ortgangM - MARGIN + GAP) / (MODULE_H + GAP));
}

function createGeneratorQuad() {
  const bb = getBoundingBox(polygon);
  generatorQuad = [
    { x: bb.minX + 30, y: bb.minY + 30 },
    { x: bb.maxX - 30, y: bb.minY + 30 },
    { x: bb.maxX - 30, y: bb.maxY - 30 },
    { x: bb.minX + 30, y: bb.maxY - 30 }
  ];
}

function getBoundingBox(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });
  return { minX, maxX, minY, maxY };
}
