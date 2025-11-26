const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const tileType = document.getElementById('tileType');
const tilesTraufe = document.getElementById('tilesTraufe');
const tilesOrtgang = document.getElementById('tilesOrtgang');
const opacityInput = document.getElementById('opacity');
const info = document.getElementById('info');
const createGenBtn = document.getElementById('createGen');
const clearGenBtn = document.getElementById('clearGen');

let image = new Image();
let polygon = [];
let generatorQuad = null;

const handleSize = 8;
let draggingIndex = -1;
let isDragging = false;

const TILE_SIZES = {
  einfalz: { t: 0.21, o: 0.33 },
  einfalz_jumbo: { t: 0.25, o: 0.36 },
  doppelfalz: { t: 0.30, o: 0.33 },
  doppelfalz_jumbo: { t: 0.30, o: 0.38 },
};

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;

let traufeM = 0;
let ortgangM = 0;
let moduleCols = 0;
let moduleRows = 0;

canvas.addEventListener('mousedown', e => {
  const { x, y } = getMouse(e);
  draggingIndex = getHandleIndex(generatorQuad, x, y);
  if (draggingIndex !== -1) isDragging = true;
  else if (polygon.length < 4) polygon.push({ x, y });
  if (polygon.length === 4) updateRoof();
  draw();
});

canvas.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const { x, y } = getMouse(e);
  if (draggingIndex !== -1 && generatorQuad) {
    generatorQuad[draggingIndex] = { x, y };
    draw();
  }
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
  draggingIndex = -1;
});

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    image.onload = () => draw();
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

createGenBtn.addEventListener('click', () => {
  if (polygon.length !== 4) return alert("Bitte 4 Punkte setzen.");
  createGeneratorQuad();
  draw();
});

clearGenBtn.addEventListener('click', () => {
  generatorQuad = null;
  draw();
});

opacityInput.addEventListener('input', () => draw());

function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function getHandleIndex(points, x, y) {
  if (!points) return -1;
  return points.findIndex(p => Math.hypot(p.x - x, p.y - y) < handleSize + 2);
}

function updateRoof() {
  const type = tileType.value;
  const countT = parseInt(tilesTraufe.value);
  const countO = parseInt(tilesOrtgang.value);

  if (!TILE_SIZES[type] || !countT || !countO) return;

  const size = TILE_SIZES[type];
  traufeM = countT * size.t;
  ortgangM = countO * size.o;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[3]);

  const scaleT = pxTraufe > 0 ? traufeM / pxTraufe : 0;
  const scaleO = pxOrtgang > 0 ? ortgangM / pxOrtgang : 0;
  const scale = (scaleT + scaleO) / 2;

  const areaPx = polygonArea(polygon);
  const areaM2 = areaPx * scale * scale;

  info.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;
}

function createGeneratorQuad() {
  const marginOrtgang = MARGIN * (distance(polygon[0], polygon[3]) / ortgangM);
  const marginTraufe = MARGIN * (distance(polygon[0], polygon[1]) / traufeM);

  const tl = move(polygon[3], polygon[0], marginOrtgang);
  const tr = move(polygon[2], polygon[1], marginOrtgang);
  const bl = polygon[0];
  const br = polygon[1];

  generatorQuad = [tl, tr, br, bl];

  // KORREKTE Modulanzahl berechnen
  moduleCols = Math.floor((traufeM - 2 * MARGIN + GAP) / (MODULE_W + GAP));
  moduleRows = Math.floor((ortgangM - MARGIN + GAP) / (MODULE_H + GAP));
}

function move(p1, p2, dist) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const scale = dist / len;
  return { x: p1.x + dx * scale, y: p1.y + dy * scale };
}

function drawModules() {
  if (!generatorQuad || moduleCols <= 0 || moduleRows <= 0) return;

  const alpha = parseFloat(opacityInput.value);
  ctx.save();
  ctx.globalAlpha = alpha;

  const [tl, tr, br, bl] = generatorQuad;

  for (let row = 0; row < moduleRows; row++) {
    const v0 = lerp(tl, bl, row / moduleRows);
    const v1 = lerp(tr, br, row / moduleRows);
    const v2 = lerp(tl, bl, (row + 1) / moduleRows);
    const v3 = lerp(tr, br, (row + 1) / moduleRows);

    for (let col = 0; col < moduleCols; col++) {
      const a = lerp(v0, v1, col / moduleCols);
      const b = lerp(v0, v1, (col + 1) / moduleCols);
      const c = lerp(v2, v3, (col + 1) / moduleCols);
      const d = lerp(v2, v3, col / moduleCols);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();

      ctx.fillStyle = "black";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawHandles(points, color = "lime") {
  if (!points) return;
  ctx.fillStyle = color;
  for (let p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, handleSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (image.src) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (polygon.length) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    polygon.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.strokeStyle = "red";
    ctx.stroke();
  }

  if (generatorQuad) {
    ctx.beginPath();
    generatorQuad.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fill();
    ctx.strokeStyle = "lime";
    ctx.stroke();
  }

  drawModules();
  drawHandles(generatorQuad);
}
