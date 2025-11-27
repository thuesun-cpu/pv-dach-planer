const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const drawGeneratorBtn = document.getElementById("drawGeneratorBtn");
const resetBtn = document.getElementById("resetBtn");
const moduleOpacityInput = document.getElementById("moduleOpacity");
const info = document.getElementById("info");
const dachTyp = document.getElementById("dachTyp");

const image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;
let generatorQuad = null;
let draggingIndex = -1;
let fixedModuleCols = 0;
let fixedModuleRows = 0;
let scaleMtoPx = 1;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;
const HANDLE_RADIUS = 6;

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
      polygon = [];
      polygonClosed = false;
      generatorQuad = null;
      draw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("mousedown", e => {
  const pos = getMousePos(e);
  if (generatorQuad) {
    const idx = generatorQuad.findIndex(p =>
      Math.hypot(p.x - pos.x, p.y - pos.y) < HANDLE_RADIUS + 3
    );
    if (idx >= 0) {
      draggingIndex = idx;
      return;
    }
  }
  draw();
});

canvas.addEventListener("mousemove", e => {
  if (draggingIndex < 0) return;
  const pos = getMousePos(e);
  generatorQuad[draggingIndex] = pos;
  draw();
});

canvas.addEventListener("mouseup", () => draggingIndex = -1);

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function getTileSize() {
  switch (tileType.value) {
    case "einfalz": return { traufe: 0.21, ortgang: 0.33 };
    case "einfalzJumbo": return { traufe: 0.23, ortgang: 0.40 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "doppelfalzJumbo": return { traufe: 0.30, ortgang: 0.40 };
    default: return null;
  }
}

function computeMeasurements() {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value);
  const o = parseInt(tilesOrtgangInput.value);
  if (!tile || !t || !o) {
    info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
    return;
  }
  const traufe = tile.traufe * t;
  const ortgang = tile.ortgang * o;
  const area = traufe * ortgang;
  info.textContent = `Traufe: ${traufe.toFixed(2)} m, Ortgang: ${ortgang.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (generatorQuad) {
    ctx.beginPath();
    ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
    ctx.closePath();
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fill();
    generatorQuad.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = "white";
      ctx.fill();
    });
    drawModules();
  }
}

function drawModules() {
  if (!generatorQuad || fixedModuleCols <= 0 || fixedModuleRows <= 0) return;
  const [q0, q1, q2, q3] = generatorQuad;
  const opacity = parseFloat(moduleOpacityInput.value);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = "white";
  ctx.fillStyle = "#222";

  const cols = fixedModuleCols;
  const rows = fixedModuleRows;
  const sStep = 1 / cols;
  const tStep = 1 / rows;

  for (let r = 0; r < rows; r++) {
    const t0 = r * tStep;
    const t1 = (r + 1) * tStep;

    const left0 = lerp(q0, q3, t0);
    const right0 = lerp(q1, q2, t0);
    const left1 = lerp(q0, q3, t1);
    const right1 = lerp(q1, q2, t1);

    for (let c = 0; c < cols; c++) {
      const s0 = c * sStep;
      const s1 = (c + 1) * sStep;

      const a = lerp(left0, right0, s0);
      const b = lerp(left0, right0, s1);
      const c1 = lerp(left1, right1, s1);
      const d = lerp(left1, right1, s0);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

function lerp(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
  };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

drawGeneratorBtn.addEventListener("click", () => {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value);
  const o = parseInt(tilesOrtgangInput.value);
  if (!tile || !t || !o) {
    alert("Bitte Ziegelmaße eingeben");
    return;
  }

  const traufeM = tile.traufe * t;
  const ortgangM = tile.ortgang * o;

  const pxTraufe = canvas.width * 0.8;
  const pxOrtgang = pxTraufe * (ortgangM / traufeM);
  scaleMtoPx = pxTraufe / traufeM;

  const marginPx = MARGIN * scaleMtoPx;

  const x = canvas.width * 0.1;
  const y = canvas.height * 0.4;

  const q0 = { x: x + marginPx, y: y + marginPx };
  const q1 = { x: x + pxTraufe - marginPx, y: y + marginPx };
  const q2 = { x: x + pxTraufe - marginPx, y: y + pxOrtgang - marginPx };
  const q3 = { x: x + marginPx, y: y + pxOrtgang - marginPx };

  generatorQuad = [q0, q1, q2, q3];

  const usableW = traufeM - 2 * MARGIN;
  const usableH = ortgangM - 2 * MARGIN;
  fixedModuleCols = Math.floor((usableW + GAP) / (MODULE_W + GAP));
  fixedModuleRows = Math.floor((usableH + GAP) / (MODULE_H + GAP));

  computeMeasurements();
  draw();
});

resetBtn.addEventListener("click", () => {
  generatorQuad = null;
  fixedModuleCols = 0;
  fixedModuleRows = 0;
  draw();
});

tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);
moduleOpacityInput.addEventListener("input", draw);
