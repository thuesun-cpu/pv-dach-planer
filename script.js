const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const resetBtn = document.getElementById("resetBtn");
const info = document.getElementById("info");

const roofImage = document.getElementById("roofImage");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let generatorQuad = null;
let draggingIndex = -1;
let traufeM = 0;
let ortgangM = 0;
let areaM2 = 0;

// Modul-Parameter
const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;

canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);
  draggingIndex = findHandleIndex(generatorQuad, pos, 10);
});

canvas.addEventListener("mousemove", (e) => {
  if (draggingIndex >= 0 && generatorQuad) {
    generatorQuad[draggingIndex] = getMousePos(e);
    draw();
  }
});

canvas.addEventListener("mouseup", () => draggingIndex = -1);

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    roofImage.onload = () => {
      canvas.width = roofImage.width;
      canvas.height = roofImage.height;
      initGeneratorQuad();
      draw();
    };
    roofImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

resetBtn.addEventListener("click", () => {
  initGeneratorQuad();
  draw();
});

tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function findHandleIndex(points, pos, radius) {
  if (!points) return -1;
  for (let i = 0; i < points.length; i++) {
    if (distance(points[i], pos) <= radius) return i;
  }
  return -1;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeMeasurements() {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value, 10);
  const o = parseInt(tilesOrtgangInput.value, 10);
  if (!tile || !t || !o) return;

  traufeM = tile.traufe * t;
  ortgangM = tile.ortgang * o;

  areaM2 = traufeM * ortgangM;

  info.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;
  draw();
}

function getTileSize() {
  switch (tileType.value) {
    case "einfalz": return { traufe: 0.215, ortgang: 0.33 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "jumbo": return { traufe: 0.30, ortgang: 0.40 };
    default: return null;
  }
}

function initGeneratorQuad() {
  const w = canvas.width;
  const h = canvas.height;
  generatorQuad = [
    { x: w * 0.2, y: h * 0.2 }, // TL
    { x: w * 0.8, y: h * 0.2 }, // TR
    { x: w * 0.8, y: h * 0.8 }, // BR
    { x: w * 0.2, y: h * 0.8 }  // BL
  ];
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGeneratorQuad();
  if (generatorQuad && traufeM && ortgangM) {
    drawModulesWithinGenerator();
  }
}

function drawGeneratorQuad() {
  if (!generatorQuad) return;
  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#00ff7f";
  generatorQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function drawModulesWithinGenerator() {
  const pxPerM_T = distance(generatorQuad[0], generatorQuad[1]) / traufeM;
  const pxPerM_O = distance(generatorQuad[0], generatorQuad[3]) / ortgangM;
  const pxPerM = (pxPerM_T + pxPerM_O) / 2;

  const modW = MODULE_W * pxPerM;
  const modH = MODULE_H * pxPerM;
  const gap = GAP * pxPerM;
  const margin = MARGIN * pxPerM;

  const q = generatorQuad;

  const innerTL = {
    x: q[0].x + (q[1].x - q[0].x) * (MARGIN / traufeM) + (q[3].x - q[0].x) * (MARGIN / ortgangM),
    y: q[0].y + (q[1].y - q[0].y) * (MARGIN / traufeM) + (q[3].y - q[0].y) * (MARGIN / ortgangM),
  };
  const innerTR = lerp(q[1], q[2], MARGIN / ortgangM);
  const innerBR = lerp(q[2], q[3], MARGIN / traufeM);
  const innerBL = lerp(q[3], q[0], MARGIN / ortgangM);

  const cols = Math.floor((traufeM - 2 * MARGIN + GAP) / (MODULE_W + GAP));
  const rows = Math.floor((ortgangM - 2 * MARGIN + GAP) / (MODULE_H + GAP));

  ctx.fillStyle = "rgba(80,80,80,0.6)";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    const v0 = r / rows;
    const v1 = (r + 1) / rows;

    const leftTop = lerp(innerTL, innerBL, v0);
    const rightTop = lerp(innerTR, innerBR, v0);
    const leftBottom = lerp(innerTL, innerBL, v1);
    const rightBottom = lerp(innerTR, innerBR, v1);

    for (let c = 0; c < cols; c++) {
      const u0 = c / cols;
      const u1 = (c + 1) / cols;

      const p1 = lerp(leftTop, rightTop, u0);
      const p2 = lerp(leftTop, rightTop, u1);
      const p3 = lerp(leftBottom, rightBottom, u1);
      const p4 = lerp(leftBottom, rightBottom, u0);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
