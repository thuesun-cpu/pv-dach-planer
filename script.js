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
const roofType = document.getElementById("roofType");

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
    ctx.fillStyle = "rgba(255,255,255,0.3)";
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

drawGeneratorBtn.addEventListener("click", () => {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value);
  const o = parseInt(tilesOrtgangInput.value);
  if (!tile || !t || !o || !imageLoaded) {
    alert("Bitte Ziegelangaben und Bild angeben.");
    return;
  }

  const traufeM = tile.traufe * t;
  const ortgangM = tile.ortgang * o;

  const widthPx = canvas.width;
  const heightPx = canvas.height;
  const avgScale = (widthPx / traufeM + heightPx / ortgangM) / 2;
  scaleMtoPx = avgScale;

  const marginPx = MARGIN * scaleMtoPx;
  const usableW = traufeM - 2 * MARGIN;
  const usableH = ortgangM - 2 * MARGIN;

  fixedModuleCols = Math.floor((usableW + GAP) / (MODULE_W + GAP));
  fixedModuleRows = Math.floor((usableH + GAP) / (MODULE_H + GAP));

  const moduleAreaW = fixedModuleCols * (MODULE_W + GAP) - GAP;
  const moduleAreaH = fixedModuleRows * (MODULE_H + GAP) - GAP;

  const totalModuleWpx = moduleAreaW * scaleMtoPx;
  const totalModuleHpx = moduleAreaH * scaleMtoPx;

  const left = marginPx;
  const top = marginPx;

  const right = left + totalModuleWpx;
  const bottom = top + totalModuleHpx;

  generatorQuad = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ];

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

function lerp(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
  };
}

function drawModules() {
  if (!generatorQuad || fixedModuleCols <= 0 || fixedModuleRows <= 0) return;

  const [q0, q1, q2, q3] = generatorQuad;
  const opacity = parseFloat(moduleOpacityInput.value);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = "white";
  ctx.fillStyle = "black";

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
