const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const info = document.getElementById("info");
const drawGeneratorBtn = document.getElementById("drawGeneratorBtn");
const clearGeneratorBtn = document.getElementById("clearGeneratorBtn");
const moduleOpacityInput = document.getElementById("moduleOpacity");

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

// Bild hochladen
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    image.onload = () => {
      imageLoaded = true;
      const scale = Math.min(1000 / image.width, 1);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      draw();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Zeichnen
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

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

    // Ziehbare Handles
    ctx.fillStyle = "#ffffff";
    generatorQuad.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawModulesInGenerator();
}

// Ziegelmaße
function getTileSize() {
  switch (tileType.value) {
    case "einfalz": return { traufe: 0.21, ortgang: 0.33 };
    case "einfalzJumbo": return { traufe: 0.25, ortgang: 0.36 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "doppelfalzJumbo": return { traufe: 0.30, ortgang: 0.38 };
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

// Generatorfläche berechnen
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

  draw();
}

drawGeneratorBtn.addEventListener("click", () => {
  createGeneratorQuad();
});

clearGeneratorBtn.addEventListener("click", () => {
  generatorQuad = null;
  draw();
});

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

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

canvas.addEventListener("mousemove", (e) => {
  if (draggingGeneratorIndex === -1) return;
  const rect = canvas.getBoundingClientRect();
  const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  if (generatorQuad && generatorQuad[draggingGeneratorIndex]) {
    generatorQuad[draggingGeneratorIndex] = pos;
    draw();
  }
});

canvas.addEventListener("mouseup", () => {
  draggingGeneratorIndex = -1;
});

tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);
moduleOpacityInput.addEventListener("input", draw);

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function findHandleIndex(points, pos, radius) {
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - pos.x;
    const dy = points[i].y - pos.y;
    if (dx * dx + dy * dy <= radius * radius) return i;
  }
  return -1;
}

function drawModulesInGenerator() {
  if (!generatorQuad || generatorQuad.length < 4 || scaleMtoPx === 0) return;

  const startX = generatorQuad[0].x + MARGIN * scaleMtoPx;
  const startY = generatorQuad[0].y + MARGIN * scaleMtoPx;
  const endX = generatorQuad[1].x - MARGIN * scaleMtoPx;
  const endY = generatorQuad[3].y - MARGIN * scaleMtoPx;

  const usableW = endX - startX;
  const usableH = endY - startY;

  const moduleWpx = MODULE_W * scaleMtoPx;
  const moduleHpx = MODULE_H * scaleMtoPx;
  const gapPx = GAP * scaleMtoPx;

  const cols = Math.floor((usableW + gapPx) / (moduleWpx + gapPx));
  const rows = Math.floor((usableH + gapPx) / (moduleHpx + gapPx));

  const opacity = parseFloat(moduleOpacityInput.value);

  ctx.save();
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (moduleWpx + gapPx);
      const y = startY + r * (moduleHpx + gapPx);
      ctx.strokeRect(x, y, moduleWpx, moduleHpx);
    }
  }

  ctx.restore();
}
