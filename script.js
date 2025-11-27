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
  if (!tile || !t || !o || !polygonClosed) {
    alert("Bitte Dachfläche und Ziegelmaße korrekt angeben.");
    return;
  }

  const traufeM = tile.traufe * t;
  const ortgangM = tile.ortgang * o;

  const scaleX = canvas.width / traufeM;
  const scaleY = canvas.height / ortgangM;
  scaleMtoPx = (scaleX + scaleY) / 2;

  const marginPx = MARGIN * scaleMtoPx;

  const width = traufeM * scaleMtoPx;
  const height = ortgangM * scaleMtoPx;

const shrinkFactor = 0.9;
const centerX = marginPx + width / 2;
const centerY = marginPx + height / 2;

const q0 = {
  x: centerX - (width / 2) * shrinkFactor,
  y: centerY - (height / 2) * shrinkFactor
};
const q1 = {
  x: centerX + (width / 2) * shrinkFactor,
  y: centerY - (height / 2) * shrinkFactor
};
const q2 = {
  x: centerX + (width / 2) * shrinkFactor,
  y: centerY + (height / 2) * shrinkFactor
};
const q3 = {
  x: centerX - (width / 2) * shrinkFactor,
  y: centerY + (height / 2) * shrinkFactor
};


  // Modulanzahl fix berechnen auf Basis verfügbarer Fläche (abzgl. 30 cm links/oben)
  const usableW = traufeM - MARGIN;
  const usableH = ortgangM - MARGIN;
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

  // 30 cm Abstand auf linker + oberer Seite
  const s0 = MARGIN / (fixedModuleCols * (MODULE_W + GAP));
  const t0 = MARGIN / (fixedModuleRows * (MODULE_H + GAP));

  for (let r = 0; r < rows; r++) {
    const tStart = t0 + r * tStep;
    const tEnd = t0 + (r + 1) * tStep;

    const leftStart = lerp(q0, q3, tStart);
    const rightStart = lerp(q1, q2, tStart);
    const leftEnd = lerp(q0, q3, tEnd);
    const rightEnd = lerp(q1, q2, tEnd);

    for (let c = 0; c < cols; c++) {
      const sStart = s0 + c * sStep;
      const sEnd = s0 + (c + 1) * sStep;

      const a = lerp(leftStart, rightStart, sStart);
      const b = lerp(leftStart, rightStart, sEnd);
      const c1 = lerp(leftEnd, rightEnd, sEnd);
      const d = lerp(leftEnd, rightEnd, sStart);

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
