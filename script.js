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

// ============ FILE UPLOAD =============
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

  // Dachpolygon
  if (polygon.length > 0) {
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

  // Generatorfläche
  if (generatorQuad) {
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

  const marginPx = MARGIN * scale;

  const q0 = {
    x: polygon[0].x + marginPx,
    y: polygon[0].y + marginPx
  };
  const q1 = {
    x: polygon[1].x - marginPx,
    y: polygon[1].y + marginPx
  };
  const q2 = {
    x: polygon[2].x - marginPx,
    y: polygon[2].y - marginPx
  };
  const q3 = {
    x: polygon[3].x + marginPx,
    y: polygon[3].y - marginPx
  };

  generatorQuad = [q0, q1, q2, q3];
  draw();
}

function drawModulesInGenerator() {
  if (!generatorQuad || generatorQuad.length !== 4 || scaleMtoPx === 0) return;

  const q0 = generatorQuad[0];
  const q1 = generatorQuad[1];
  const q2 = generatorQuad[2];
  const q3 = generatorQuad[3];

  const totalTraufePx = distance(q0, q1);
  const totalOrtgangPx = distance(q0, q3);

  const totalTraufeM = totalTraufePx / scaleMtoPx;
  const totalOrtgangM = totalOrtgangPx / scaleMtoPx;

  const usableTraufeM = totalTraufeM;
  const usableOrtgangM = totalOrtgangM;

  const cols = Math.floor((usableTraufeM + GAP) / (MODULE_W + GAP));
  const rows = Math.floor((usableOrtgangM + GAP) / (MODULE_H + GAP));

  const startS = 0;
  const startT = 0;

  const stepS = (MODULE_W + GAP) / totalTraufeM;
  const stepT = (MODULE_H + GAP) / totalOrtgangM;

  const opacity = parseFloat(moduleOpacityInput.value);

  ctx.save();
  ctx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    const t0 = startT + r * stepT;
    const t1 = startT + (r + 1) * stepT;

    const leftTop = lerp(q0, q3, t0);
    const rightTop = lerp(q1, q2, t0);
    const leftBottom = lerp(q0, q3, t1);
    const rightBottom = lerp(q1, q2, t1);

    for (let c = 0; c < cols; c++) {
      const s0 = startS + c * stepS;
      const s1 = startS + (c + 1) * stepS;

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

// ============ EVENTS =============
drawGeneratorBtn.addEventListener("click", createGeneratorQuad);
clearGeneratorBtn.addEventListener("click", () => { generatorQuad = null; draw(); });
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

// ============ HELPER =============
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
