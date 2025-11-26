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

  if (!imageLoaded || polygonClosed) return;
  if (polygon.length >= 3 && Math.hypot(polygon[0].x - pos.x, polygon[0].y - pos.y) < 10) {
    polygonClosed = true;
    computeMeasurements();
  } else {
    polygon.push(pos);
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (polygon.length) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
    if (polygonClosed) {
      ctx.closePath();
      ctx.fillStyle = "rgba(255,0,0,0.2)";
      ctx.fill();
    }
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#00bcd4";
    polygon.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

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
    case "einfalzJumbo": return { traufe: 0.24, ortgang: 0.40 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "doppelfalzJumbo": return { traufe: 0.30, ortgang: 0.40 };
    default: return null;
  }
}

function computeMeasurements() {
  const tile = getTileSize();
  const t = parseInt(tilesTraufeInput.value);
  const o = parseInt(tilesOrtgangInput.value);
  if (!tile || !t || !o || !polygonClosed) {
    info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
    return;
  }
  const traufe = tile.traufe * t;
  const ortgang = tile.ortgang * o;
  const area = traufe * ortgang;
  info.textContent = `Traufe: ${traufe.toFixed(2)} m, Ortgang: ${ortgang.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;
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
  if (!tile || !t || !o || !polygonClosed || polygon.length < 4) {
    alert("Bitte Dachfläche und Ziegelmaße korrekt angeben.");
    return;
  }

  const traufeM = tile.traufe * t;
  const ortgangM = tile.ortgang * o;

  const traufePx = distance(polygon[0], polygon[1]);
  const ortgangPx = distance(polygon[0], polygon[3]);
  scaleMtoPx = (traufePx / traufeM + ortgangPx / ortgangM) / 2;

  const marginPx = MARGIN * scaleMtoPx;

  const q0 = { x: polygon[0].x + marginPx, y: polygon[0].y + marginPx };
  const q1 = { x: polygon[1].x - marginPx, y: polygon[1].y + marginPx };
  const q2 = { x: polygon[2].x - marginPx, y: polygon[2].y - marginPx };
  const q3 = { x: polygon[3].x + marginPx, y: polygon[3].y - marginPx };
  generatorQuad = [q0, q1, q2, q3];

  const usableW = traufeM - 2 * MARGIN;
  const usableH = ortgangM - 2 * MARGIN;
  fixedModuleCols = Math.floor((usableW + GAP) / (MODULE_W + GAP));
  fixedModuleRows = Math.floor((usableH + GAP) / (MODULE_H + GAP));

  computeMeasurements();
  draw();
});

clearGeneratorBtn.addEventListener("click", () => {
  generatorQuad = null;
  fixedModuleCols = 0;
  fixedModuleRows = 0;
  draw();
});

tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);
moduleOpacityInput.addEventListener("input", draw);

function drawModules() {
  if (!generatorQuad || fixedModuleCols <= 0 || fixedModuleRows <= 0) return;

  const marginPx = MARGIN * scaleMtoPx;

  // Berechne innenliegende Fläche (verkleinertes Viereck)
  const shrinkEdge = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const mx = (dx / len) * marginPx;
    const my = (dy / len) * marginPx;
    return [
      { x: a.x + mx, y: a.y + my },
      { x: b.x - mx, y: b.y - my }
    ];
  };

  const [topLeft, topRight] = shrinkEdge(generatorQuad[0], generatorQuad[1]);
  const [bottomRight, bottomLeft] = shrinkEdge(generatorQuad[2], generatorQuad[3]);

  const innerQuad = [topLeft, topRight, bottomRight, bottomLeft];

  const [q0, q1, q2, q3] = innerQuad;
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
