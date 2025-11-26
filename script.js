const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");

let image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;
let generatorQuad = null;

let traufeM = 0;
let ortgangM = 0;
let areaM2 = 0;

const MODULE_W = 1.134; // m
const MODULE_H = 1.765; // m
const MODULE_GAP = 0.02; // m
const MARGIN = 0.3; // m Abstand

let moduleCols = 0;
let moduleRows = 0;
let moduleOpacity = 1;

fileInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    image.onload = function () {
      imageLoaded = true;
      canvas.width = image.width;
      canvas.height = image.height;
      polygon = [];
      polygonClosed = false;
      generatorQuad = null;
      redraw();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("opacity").addEventListener("input", (e) => {
  moduleOpacity = parseFloat(e.target.value);
  redraw();
});

canvas.addEventListener("click", function (evt) {
  if (!imageLoaded || polygonClosed) return;
  const pos = getMousePos(evt);

  if (polygon.length >= 3 && distance(pos, polygon[0]) < 10) {
    polygonClosed = true;
    updateMeasurements();
    redraw();
    return;
  }

  polygon.push(pos);
  redraw();
});

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function updateMeasurements() {
  const traufeCount = parseInt(document.getElementById("traufe")?.value);
  const ortgangCount = parseInt(document.getElementById("ortgang")?.value);
  const tileType = document.getElementById("tileSelect")?.value;

  let tileW = 0;
  let tileH = 0;

  switch (tileType) {
    case "einfalz":
      tileW = 0.215;
      tileH = 0.33;
      break;
    case "einfalzJumbo":
      tileW = 0.24; // geändert
      tileH = 0.40;
      break;
    case "doppelfalz":
      tileW = 0.30;
      tileH = 0.33;
      break;
    case "doppelfalzJumbo":
      tileW = 0.30;
      tileH = 0.40;
      break;
  }

  traufeM = traufeCount * tileW;
  ortgangM = ortgangCount * tileH;

  const pxArea = polygonArea(polygon);
  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[3]);

  const scale = ((traufeM / pxTraufe) + (ortgangM / pxOrtgang)) / 2;
  areaM2 = pxArea * scale * scale;

  document.getElementById("info").textContent =
    `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;

  createGeneratorQuad(scale);
}

function createGeneratorQuad(scale) {
  const p0 = polygon[0];
  const p1 = polygon[1];
  const p3 = polygon[3];

  const pxPerM_Traufe = distance(p0, p1) / traufeM;
  const pxPerM_Ortgang = distance(p0, p3) / ortgangM;

  const marginX = MARGIN * pxPerM_Traufe;
  const marginY = MARGIN * pxPerM_Ortgang;

  const q0 = { x: p0.x + marginX, y: p3.y + marginY };
  const q1 = { x: p1.x - marginX, y: p1.y + marginY };
  const q2 = { x: p1.x - marginX, y: p1.y + ortgangM * pxPerM_Ortgang - marginY };
  const q3 = { x: p0.x + marginX, y: p3.y + ortgangM * pxPerM_Ortgang - marginY };

  generatorQuad = [q0, q1, q2, q3];

  computeModuleGrid(pxPerM_Traufe, pxPerM_Ortgang);
}

function computeModuleGrid(pxPerM_Traufe, pxPerM_Ortgang) {
  const usableW = traufeM - 2 * MARGIN;
  const usableH = ortgangM - 2 * MARGIN;

  const totalW = MODULE_W + MODULE_GAP;
  const totalH = MODULE_H + MODULE_GAP;

  moduleCols = Math.floor(usableW / totalW);
  moduleRows = Math.floor(usableH / totalH);
}

function drawPolygon() {
  if (polygon.length === 0) return;

  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  if (polygonClosed) {
    ctx.closePath();
  }
  ctx.stroke();

  ctx.fillStyle = "#00bcd4";
  for (const point of polygon) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawModules() {
  if (!generatorQuad || moduleCols <= 0 || moduleRows <= 0) return;

  const q0 = generatorQuad[0];
  const q1 = generatorQuad[1];
  const q2 = generatorQuad[2];
  const q3 = generatorQuad[3];

  ctx.save();
  ctx.globalAlpha = moduleOpacity;

  for (let r = 0; r < moduleRows; r++) {
    const v0 = lerp(q0, q3, r / moduleRows);
    const v1 = lerp(q1, q2, r / moduleRows);
    const v0n = lerp(q0, q3, (r + 1) / moduleRows);
    const v1n = lerp(q1, q2, (r + 1) / moduleRows);

    for (let c = 0; c < moduleCols; c++) {
      const m0 = lerp(v0, v1, c / moduleCols);
      const m1 = lerp(v0, v1, (c + 1) / moduleCols);
      const m2 = lerp(v0n, v1n, (c + 1) / moduleCols);
      const m3 = lerp(v0n, v1n, c / moduleCols);

      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.lineTo(m2.x, m2.y);
      ctx.lineTo(m3.x, m3.y);
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

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) ctx.drawImage(image, 0, 0);
  drawPolygon();
  drawModules();
}
