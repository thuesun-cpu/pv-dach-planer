const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const resetBtn = document.getElementById("resetBtn");
const info = document.getElementById("info");

const roofImage = document.getElementById("roofImage");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let polygon = [];
let isClosed = false;
let traufeM = 0, ortgangM = 0, areaM2 = 0;

// Modulmaße (m)
const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;

let draggingIndex = -1;
let generatorQuad = null;
let moduleCols = 0;
let moduleRows = 0;

canvas.addEventListener("mousedown", e => {
  if (!generatorQuad) return;
  const pos = getMousePos(e);
  draggingIndex = findHandleIndex(generatorQuad, pos, 10);
});

canvas.addEventListener("mousemove", e => {
  if (draggingIndex >= 0 && generatorQuad) {
    const pos = getMousePos(e);
    generatorQuad[draggingIndex] = pos;
    draw();
  }
});

canvas.addEventListener("mouseup", () => {
  draggingIndex = -1;
});

canvas.addEventListener("click", (e) => {
  if (!roofImage.src || isClosed) return;
  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };

  if (polygon.length >= 3 && distance(pos, polygon[0]) < 10) {
    isClosed = true;
    computeRoofDimensions();
    createGeneratorQuad();
    computeModuleCounts();
    draw();
  } else {
    polygon.push(pos);
    draw();
  }
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    roofImage.onload = () => {
      canvas.width = roofImage.width;
      canvas.height = roofImage.height;
      reset();
    };
    roofImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

resetBtn.addEventListener("click", () => reset());

function reset() {
  polygon = [];
  generatorQuad = null;
  isClosed = false;
  info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Polygon
  if (polygon.length) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    if (isClosed) {
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
      ctx.fill();
    }
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const p of polygon) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#00bcd4";
      ctx.fill();
    }
  }

  if (generatorQuad && moduleCols > 0 && moduleRows > 0) {
    drawModulesPerspective();
  }
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
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

function getTileSize() {
  switch (tileType.value) {
    case "einfalz": return { traufe: 0.215, ortgang: 0.33 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "jumbo": return { traufe: 0.30, ortgang: 0.40 };
    default: return null;
  }
}

function computeRoofDimensions() {
  const tile = getTileSize();
  const nTraufe = parseInt(tilesTraufeInput.value, 10);
  const nOrtgang = parseInt(tilesOrtgangInput.value, 10);
  if (!tile || polygon.length < 4) return;

  traufeM = tile.traufe * nTraufe;
  ortgangM = tile.ortgang * nOrtgang;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[polygon.length - 1]);
  const scale = ((traufeM / pxTraufe) + (ortgangM / pxOrtgang)) / 2;
  const areaPx = polygonArea(polygon);
  areaM2 = areaPx * scale * scale;

  info.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;
}

function polygonArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum / 2);
}

function createGeneratorQuad() {
  if (!polygon || polygon.length < 4) return;
  const minX = Math.min(...polygon.map(p => p.x));
  const maxX = Math.max(...polygon.map(p => p.x));
  const minY = Math.min(...polygon.map(p => p.y));
  const maxY = Math.max(...polygon.map(p => p.y));

  generatorQuad = [
    { x: minX + 30, y: minY + 30 }, // TL
    { x: maxX - 30, y: minY + 30 }, // TR
    { x: maxX - 30, y: maxY - 30 }, // BR
    { x: minX + 30, y: maxY - 30 }  // BL
  ];
}

function computeModuleCounts() {
  const usableT = traufeM - 2 * MARGIN;
  const usableO = ortgangM - 2 * MARGIN;
  moduleCols = Math.floor((usableT + GAP) / (MODULE_W + GAP));
  moduleRows = Math.floor((usableO + GAP) / (MODULE_H + GAP));
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function drawModulesPerspective() {
  const q = generatorQuad;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(80,80,80,0.6)";

  for (let r = 0; r < moduleRows; r++) {
    const t0 = r / moduleRows;
    const t1 = (r + 1) / moduleRows;

    const left0 = lerp(q[0], q[3], t0);
    const right0 = lerp(q[1], q[2], t0);
    const left1 = lerp(q[0], q[3], t1);
    const right1 = lerp(q[1], q[2], t1);

    for (let c = 0; c < moduleCols; c++) {
      const s0 = c / moduleCols;
      const s1 = (c + 1) / moduleCols;

      const p1 = lerp(left0, right0, s0);
      const p2 = lerp(left0, right0, s1);
      const p3 = lerp(left1, right1, s1);
      const p4 = lerp(left1, right1, s0);

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

  // Griffe zeichnen
  ctx.fillStyle = "#00ff7f";
  generatorQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}
