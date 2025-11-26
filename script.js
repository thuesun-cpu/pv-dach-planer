const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");

let image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;

let draggingPointIndex = -1;
let isDragging = false;

let traufeM = 0;
let ortgangM = 0;
let areaM2 = 0;

let generatorQuad = null;
let draggingGeneratorIndex = -1;

let moduleOpacity = 1;
let moduleRows = 0;
let moduleCols = 0;

const HANDLE_RADIUS = 6;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const MODULE_GAP = 0.02;
const MARGIN = 0.3;

// ---------- Bild laden ----------

fileInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    image.onload = () => {
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

// ---------- Mausposition ----------

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

// ---------- Maus-Events ----------

canvas.addEventListener("mousedown", function (evt) {
  const pos = getMousePos(evt);
  isDragging = true;

  if (polygonClosed) {
    if (generatorQuad) {
      for (let i = 0; i < generatorQuad.length; i++) {
        if (distance(pos, generatorQuad[i]) < HANDLE_RADIUS + 4) {
          draggingGeneratorIndex = i;
          return;
        }
      }
    }
  } else {
    for (let i = 0; i < polygon.length; i++) {
      if (distance(pos, polygon[i]) < HANDLE_RADIUS + 4) {
        draggingPointIndex = i;
        return;
      }
    }
  }
});

canvas.addEventListener("mousemove", function (evt) {
  if (!isDragging) return;
  const pos = getMousePos(evt);

  if (draggingPointIndex >= 0) {
    polygon[draggingPointIndex] = pos;
    redraw();
  }

  if (draggingGeneratorIndex >= 0) {
    generatorQuad[draggingGeneratorIndex] = pos;
    redraw();
  }
});

canvas.addEventListener("mouseup", function () {
  isDragging = false;
  draggingPointIndex = -1;
  draggingGeneratorIndex = -1;
});

// ---------- Polygon zeichnen per Klick ----------

canvas.addEventListener("click", function (evt) {
  if (!imageLoaded || polygonClosed) return;
  const pos = getMousePos(evt);

  // Schließe Polygon nur, wenn Klick auf Startpunkt
  if (polygon.length >= 3 && distance(pos, polygon[0]) < 10) {
    polygonClosed = true;
    updateMeasurements();
    redraw();
    return;
  }

  polygon.push(pos);
  redraw();
});

// ---------- Zeichnen ----------

function redraw() {
  if (!imageLoaded) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  drawPolygon();
  if (polygonClosed) {
    drawGeneratorQuad();
    drawModules();
  }
}

function drawPolygon() {
  if (polygon.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }

  if (polygonClosed) {
    ctx.closePath();
    ctx.fillStyle = "rgba(0,255,0,0.05)";
    ctx.fill();
  }

  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "lime";
  polygon.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawGeneratorQuad() {
  if (!generatorQuad || generatorQuad.length !== 4) return;

  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();
  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "lime";
  generatorQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function drawModules() {
  // Module werden später gezeichnet
}

document.getElementById("opacity")?.addEventListener("input", function (e) {
  moduleOpacity = parseFloat(e.target.value);
  redraw();
});

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
      tileW = 0.24;
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
}
