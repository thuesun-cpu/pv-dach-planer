const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const drawGeneratorBtn = document.getElementById("drawGeneratorBtn");
const clearGeneratorBtn = document.getElementById("clearGeneratorBtn");
const moduleOpacityInput = document.getElementById("moduleOpacity");
const info = document.getElementById("info");

const image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;
let generatorQuad = null;
let draggingGeneratorIndex = -1;

let scaleMtoPx = 1;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.30;
const HANDLE_RADIUS = 6;

let moduleGrid = [];

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    image.onload = () => {
      imageLoaded = true;
      const scale = Math.min(1000 / image.width, 1);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      draw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (polygon.length > 0) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "red";
    ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
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

    ctx.fillStyle = "#00bcd4";
    polygon.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (generatorQuad) {
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    generatorQuad.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawModulesInGenerator();
}

function getTileSize() {
  switch (tileType.value) {
    case "einfalz": return { traufe: 0.21, ortgang: 0.33 };
    case "einfalzJumbo": return { traufe: 0.24, ortgang: 0.40 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "doppelfalzJumbo": return { traufe: 0.30, ortgang: 0.40 };
    default: return null;
  }
}

function computeMeasurements() {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value, 10);
  const o = parseInt(tilesOrtgangInput.value, 10);
  if (!tile || !t || !o || !polygonClosed) {
    info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
    return;
  }

  const traufe = tile.traufe * t;
  const ortgang = tile.ortgang * o;
  const area = traufe * ortgang;
  info.textContent = `Traufe: ${traufe.toFixed(2)} m, Ortgang: ${ortgang.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;
}

function createGeneratorQuad() {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value, 10);
  const o = parseInt(tilesOrtgangInput.value, 10);
  if (!tile || !t || !o || !polygonClosed || polygon.length < 4) {
    alert("Bitte Dachfläche schließen und Ziegeldaten eingeben.");
    return;
  }

  const traufeM = tile.traufe * t;
  const ortgangM = tile.ortgang * o;

  const traufePx = distance(polygon[0], polygon[1]);
  const ortgangPx = distance(polygon[0], polygon[3]);
  const scale = (traufePx / traufeM + ortgangPx / ortgangM) / 2;
  scaleMtoPx = scale;

  const marginX = MARGIN * scale;
  const marginY = MARGIN * scale;

  const startX = polygon[0].x + marginX;
  const startY = polygon[3].y + marginY;

  const width = traufeM * scale - 2 * marginX;
  const height = ortgangM * scale - 2 * marginY;

  generatorQuad = [
    { x: startX, y: startY },
    { x: startX + width, y: startY },
    { x: startX + width, y: startY + height },
    { x: startX, y: startY + height }
  ];

  initModuleGrid();
  draw();
}

function initModuleGrid() {
  moduleGrid = [];
  const usableW = distance(generatorQuad[0], generatorQuad[1]) / scaleMtoPx;
  const usableH = distance(generatorQuad[0], generatorQuad[3]) / scaleMtoPx;

  const cols = Math.floor((usableW + GAP) / (MODULE_W + GAP));
  const rows = Math.floor((usableH + GAP) / (MODULE_H + GAP));

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(true); // true = aktiv
    }
    moduleGrid.push(row);
  }
}

function drawModulesInGenerator() {
  if (!generatorQuad || generatorQuad.length < 4 || scaleMtoPx === 0 || moduleGrid.length === 0) return;

  const q0 = generatorQuad[0], q1 = generatorQuad[1], q2 = generatorQuad[2], q3 = generatorQuad[3];
  const cols = moduleGrid[0].length;
  const rows = moduleGrid.length;

  const tStep = 1 / rows;
  const sStep = 1 / cols;

  const opacity = parseFloat(moduleOpacityInput.value);
  ctx.save();
  ctx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    const t0 = r * tStep, t1 = (r + 1) * tStep;
    const leftTop = lerp(q0, q3, t0), rightTop = lerp(q1, q2, t0);
    const leftBottom = lerp(q0, q3, t1), rightBottom = lerp(q1, q2, t1);

    for (let c = 0; c < cols; c++) {
      if (!moduleGrid[r][c]) continue;

      const s0 = c * sStep, s1 = (c + 1) * sStep;

      const a = lerp(leftTop, rightTop, s0);
      const b = lerp(leftTop, rightTop, s1);
      const c1 = lerp(leftBottom, rightBottom, s1);
      const d = lerp(leftBottom, rightBottom, s0);

      ctx.globalAlpha = opacity;
      ctx.fillStyle = "black";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = "white";
      ctx.stroke();
    }
  }

  ctx.restore();
}

canvas.addEventListener("click", e => {
  const pos = getMousePos(e);
  if (!generatorQuad || moduleGrid.length === 0) return;

  const q0 = generatorQuad[0], q1 = generatorQuad[1], q2 = generatorQuad[2], q3 = generatorQuad[3];
  const cols = moduleGrid[0].length;
  const rows = moduleGrid.length;

  const tStep = 1 / rows;
  const sStep = 1 / cols;

  for (let r = 0; r < rows; r++) {
    const t0 = r * tStep, t1 = (r + 1) * tStep;
    const leftTop = lerp(q0, q3, t0), rightTop = lerp(q1, q2, t0);
    const leftBottom = lerp(q0, q3, t1), rightBottom = lerp(q1, q2, t1);

    for (let c = 0; c < cols; c++) {
      const s0 = c * sStep, s1 = (c + 1) * sStep;
      const a = lerp(leftTop, rightTop, s0);
      const b = lerp(leftTop, rightTop, s1);
      const c1 = lerp(leftBottom, rightBottom, s1);
      const d = lerp(leftBottom, rightBottom, s0);

      if (pointInQuad(pos, [a, b, c1, d])) {
        moduleGrid[r][c] = !moduleGrid[r][c];
        draw();
        return;
      }
    }
  }
});

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function lerp(p1, p2, t) {
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInQuad(p, quad) {
  const [a, b, c, d] = quad;
  return pointInTriangle(p, a, b, c) || pointInTriangle(p, a, c, d);
}

function pointInTriangle(p, a, b, c) {
  const area = 0.5 * (-b.y * c.x + a.y * (-b.x + c.x) + a.x * (b.y - c.y) + b.x * c.y);
  const s = (1 / (2 * area)) * (a.y * c.x - a.x * c.y + (c.y - a.y) * p.x + (a.x - c.x) * p.y);
  const t = (1 / (2 * area)) * (a.x * b.y - a.y * b.x + (a.y - b.y) * p.x + (b.x - a.x) * p.y);
  return s >= 0 && t >= 0 && (s + t) <= 1;
}

drawGeneratorBtn.addEventListener("click", createGeneratorQuad);
clearGeneratorBtn.addEventListener("click", () => { generatorQuad = null; moduleGrid = []; draw(); });
tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);
moduleOpacityInput.addEventListener("input", draw);
