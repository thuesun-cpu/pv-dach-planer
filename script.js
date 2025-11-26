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
let fixedModuleCols = null;
let fixedModuleRows = null;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.30;
const HANDLE_RADIUS = 6;

// File Upload
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

  drawPolygon();
  drawGenerator();
  drawModulesInGenerator();
}

function drawPolygon() {
  if (polygon.length === 0) return;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "red";
  ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
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

function drawGenerator() {
  if (!generatorQuad) return;

  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
  }
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
  scaleMtoPx = (traufePx / traufeM + ortgangPx / ortgangM) / 2;

  const marginX = MARGIN * scaleMtoPx;
  const marginY = MARGIN * scaleMtoPx;

  const startX = polygon[0].x + marginX;
  const startY = polygon[3].y + marginY;

  const width = traufeM * scaleMtoPx - 2 * marginX;
  const height = ortgangM * scaleMtoPx - 2 * marginY;

  generatorQuad = [
    { x: startX, y: startY },
    { x: startX + width, y: startY },
    { x: startX + width, y: startY + height },
    { x: startX, y: startY + height }
  ];

  // Fixierte Modulanzahl berechnen (einmalig)
  const usableTraufe = traufeM - 2 * MARGIN;
  const usableOrtgang = ortgangM - 2 * MARGIN;
  fixedModuleCols = Math.floor((usableTraufe + GAP) / (MODULE_W + GAP));
  fixedModuleRows = Math.floor((usableOrtgang + GAP) / (MODULE_H + GAP));

  draw();
}

drawGeneratorBtn.addEventListener("click", createGeneratorQuad);
clearGeneratorBtn.addEventListener("click", () => {
  generatorQuad = null;
  fixedModuleCols = null;
  fixedModuleRows = null;
  draw();
});
tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);
moduleOpacityInput.addEventListener("input", draw);

canvas.addEventListener("mousedown", e => {
  const pos = getMousePos(e);
  if (generatorQuad) {
    const idx = findHandleIndex(generatorQuad, pos, HANDLE_RADIUS + 4);
    if (idx >= 0) {
      draggingGeneratorIndex = idx;
      return;
    }
  }

  if (!imageLoaded || polygonClosed) return;

  if (polygon.length >= 3 && distance(pos, polygon[0]) < 10) {
    polygonClosed = true;
    computeMeasurements();
  } else {
    polygon.push(pos);
  }
  draw();
});

canvas.addEventListener("mousemove", e => {
  if (draggingGeneratorIndex === -1) return;
  const pos = getMousePos(e);
  if (generatorQuad && generatorQuad[draggingGeneratorIndex]) {
    generatorQuad[draggingGeneratorIndex] = pos;
    draw();
  }
});
canvas.addEventListener("mouseup", () => draggingGeneratorIndex = -1);

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function findHandleIndex(points, pos, radius) {
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - pos.x;
    const dy = points[i].y - pos.y;
    if (dx * dx + dy * dy <= radius * radius) return i;
  }
  return -1;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
  };
}

function drawModulesInGenerator() {
  if (!generatorQuad || scaleMtoPx === 0 || fixedModuleCols === null || fixedModuleRows === null) return;

  const [q0, q1, q2, q3] = generatorQuad;
  const opacity = parseFloat(moduleOpacityInput.value);

  const totalRows = fixedModuleRows;
  const totalCols = fixedModuleCols;

  ctx.save();
  ctx.lineWidth = 1;

  for (let r = 0; r < totalRows; r++) {
    const t0 = r / totalRows;
    const t1 = (r + 1) / totalRows;

    const leftStart = lerp(q0, q3, t0);
    const rightStart = lerp(q1, q2, t0);
    const leftEnd = lerp(q0, q3, t1);
    const rightEnd = lerp(q1, q2, t1);

    for (let c = 0; c < totalCols; c++) {
      const s0 = c / totalCols;
      const s1 = (c + 1) / totalCols;

      const a = lerp(leftStart, rightStart, s0);
      const b = lerp(leftStart, rightStart, s1);
      const c1 = lerp(leftEnd, rightEnd, s1);
      const d = lerp(leftEnd, rightEnd, s0);

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
