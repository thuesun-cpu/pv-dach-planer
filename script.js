const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let image = new Image();
let polygon = [];
let polygonClosed = false;
let generatorQuad = null;
let draggingPointIndex = null;
let draggingGenPointIndex = null;
let modules = [];

const moduleOpacitySlider = document.getElementById("moduleOpacity");

const TILE_TYPES = {
  "Einfalzziegel 21x33 cm": { width: 0.21, height: 0.33 },
  "Einfalz Jumbo 25x40 cm": { width: 0.25, height: 0.40 },
  "Doppelfalz 30x33 cm": { width: 0.30, height: 0.33 },
  "Doppelfalz Jumbo 30x40 cm": { width: 0.30, height: 0.40 },
};

const MODULE_WIDTH = 1.134;
const MODULE_HEIGHT = 1.765;
const GAP = 0.02;
const MARGIN = 0.30;

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      draw();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("click", (e) => {
  const pos = getMousePos(e);

  // Polygon zeichnen
  if (!polygonClosed) {
    if (polygon.length >= 3 && isNear(pos, polygon[0], 10)) {
      polygonClosed = true;
      updateMeasurements();
      draw();
      return;
    }
    polygon.push(pos);
    draw();
    return;
  }

  // Module toggeln
  for (let i = 0; i < modules.length; i++) {
    if (pointInPolygon(pos, modules[i])) {
      modules.splice(i, 1);
      draw();
      return;
    }
  }
});

canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);
  draggingPointIndex = findNearbyPoint(polygon, pos);
  draggingGenPointIndex = findNearbyPoint(generatorQuad, pos);
});

canvas.addEventListener("mousemove", (e) => {
  const pos = getMousePos(e);
  if (draggingPointIndex != null) {
    polygon[draggingPointIndex] = pos;
    updateMeasurements();
    draw();
  } else if (draggingGenPointIndex != null && generatorQuad) {
    generatorQuad[draggingGenPointIndex] = pos;
    updateModules();
    draw();
  }
});

canvas.addEventListener("mouseup", () => {
  draggingPointIndex = null;
  draggingGenPointIndex = null;
});

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (image) ctx.drawImage(image, 0, 0);

  drawPolygon(polygon, "lime");
  drawPolygon(generatorQuad, "green", true);

  ctx.globalAlpha = parseFloat(moduleOpacitySlider.value);

  modules.forEach((mod) => {
    drawPolygon(mod, "black", true);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  ctx.globalAlpha = 1;
}

function drawPolygon(points, color, fill = false) {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

function isNear(p1, p2, r = 10) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) < r;
}

function findNearbyPoint(arr, pos, r = 10) {
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) {
    if (isNear(arr[i], pos, r)) return i;
  }
  return null;
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function updateMeasurements() {
  const tileType = document.getElementById("tileType").value;
  const tilesTraufe = parseInt(document.getElementById("tilesTraufe").value);
  const tilesOrtgang = parseInt(document.getElementById("tilesOrtgang").value);

  const tile = TILE_TYPES[tileType];
  if (!polygonClosed || !tile || !tilesTraufe || !tilesOrtgang) return;

  const traufeM = tilesTraufe * tile.width;
  const ortgangM = tilesOrtgang * tile.height;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[3]);
  const scaleX = traufeM / pxTraufe;
  const scaleY = ortgangM / pxOrtgang;
  const mPerPx = (scaleX + scaleY) / 2;

  const areaPx = polygonArea(polygon);
  const areaM2 = areaPx * mPerPx * mPerPx;

  document.getElementById("measurements").textContent =
    `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;

  // Generatorfläche neu setzen
  const marginX = MARGIN / scaleX;
  const marginY = MARGIN / scaleY;

  generatorQuad = [
    { x: polygon[3].x + marginX, y: polygon[3].y + marginY },
    { x: polygon[2].x - marginX, y: polygon[2].y + marginY },
    { x: polygon[1].x - marginX, y: polygon[1].y - marginY },
    { x: polygon[0].x + marginX, y: polygon[0].y - marginY },
  ];

  updateModules();
}

function updateModules() {
  if (!generatorQuad) return;

  modules = [];

  const traufeM = parseFloat(document.getElementById("measurements").textContent.split(" ")[1]);
  const ortgangM = parseFloat(document.getElementById("measurements").textContent.split(" ")[4]);

  const modW = MODULE_WIDTH;
  const modH = MODULE_HEIGHT;

  const usableWidth = traufeM - 2 * MARGIN;
  const usableHeight = ortgangM - MARGIN;

  const numCols = Math.floor((usableWidth + GAP) / (modW + GAP));
  const numRows = Math.floor((usableHeight) / (modH + GAP)); // ✅ FIXED: GAP not added to usableHeight

  const tl = generatorQuad[0];
  const tr = generatorQuad[1];
  const br = generatorQuad[2];
  const bl = generatorQuad[3];

  for (let row = 0; row < numRows; row++) {
    const v1 = lerp(tl, bl, row / numRows);
    const v2 = lerp(tr, br, row / numRows);
    const v3 = lerp(tl, bl, (row + 1) / numRows);
    const v4 = lerp(tr, br, (row + 1) / numRows);

    for (let col = 0; col < numCols; col++) {
      const p1 = lerp(v1, v2, col / numCols);
      const p2 = lerp(v1, v2, (col + 1) / numCols);
      const p3 = lerp(v3, v4, (col + 1) / numCols);
      const p4 = lerp(v3, v4, col / numCols);
      modules.push([p1, p2, p3, p4]);
    }
  }
  draw();
}

function distance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

function lerp(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}
