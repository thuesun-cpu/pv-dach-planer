const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const traufeCount = document.getElementById("traufeCount");
const ortgangCount = document.getElementById("ortgangCount");
const showGenBtn = document.getElementById("showGenBtn");
const clearGenBtn = document.getElementById("clearGenBtn");
const measurements = document.getElementById("measurements");
const opacitySlider = document.getElementById("opacitySlider");

let image = new Image();
let imgLoaded = false;

let polygon = [];
let polygonClosed = false;

let genQuad = null; // Generatorfläche mit 4 Punkten
let draggingIndex = -1;

const HANDLE_SIZE = 8;

const MODULE_WIDTH = 1.134;
const MODULE_HEIGHT = 1.765;
const GAP = 0.02;
const MARGIN = 0.30;

let scale = 1;
let pxPerM = 1;

let modules = [];

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    image.onload = () => {
      imgLoaded = true;
      canvas.width = image.width;
      canvas.height = image.height;
      redraw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("click", e => {
  const pos = getMousePos(e);

  if (!polygonClosed && imgLoaded) {
    if (polygon.length >= 3 && isNear(pos, polygon[0])) {
      polygonClosed = true;
      updateMeasurements();
      redraw();
    } else {
      polygon.push(pos);
      redraw();
    }
    return;
  }

  // Modul aktiv/inaktiv schalten
  if (polygonClosed && genQuad) {
    for (let mod of modules) {
      if (pointInPolygon(pos, mod.corners)) {
        mod.active = !mod.active;
        redraw();
        return;
      }
    }
  }
});

canvas.addEventListener("mousedown", e => {
  if (!genQuad) return;
  const pos = getMousePos(e);
  draggingIndex = genQuad.findIndex(p => isNear(p, pos));
});

canvas.addEventListener("mousemove", e => {
  if (draggingIndex === -1) return;
  const pos = getMousePos(e);
  genQuad[draggingIndex] = pos;
  redraw();
});

canvas.addEventListener("mouseup", () => {
  draggingIndex = -1;
});

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function isNear(p1, p2, r = 10) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) < r;
}

function updateMeasurements() {
  const tileSizes = {
    einfalz: { w: 0.21, h: 0.33 },
    einfalzjumbo: { w: 0.24, h: 0.40 },
    doppelfalz: { w: 0.30, h: 0.33 },
    doppelfalzjumbo: { w: 0.30, h: 0.40 }
  };

  const type = tileType.value;
  const tile = tileSizes[type];
  if (!tile || polygon.length < 2) return;

  const traufe = parseInt(traufeCount.value, 10);
  const ortgang = parseInt(ortgangCount.value, 10);

  const traufeM = tile.w * traufe;
  const ortgangM = tile.h * ortgang;
  pxPerM = distance(polygon[0], polygon[1]) / traufeM;

  const area = traufeM * ortgangM;
  measurements.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imgLoaded) ctx.drawImage(image, 0, 0);

  if (polygon.length) {
    ctx.strokeStyle = "green";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    if (polygonClosed) ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "lime";
    for (let pt of polygon) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_SIZE, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (genQuad) {
    drawGenerator();
    drawModules();
  }
}

function drawGenerator() {
  ctx.save();
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(genQuad[0].x, genQuad[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(genQuad[i].x, genQuad[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#00ff00";
  genQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_SIZE, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function drawModules() {
  const alpha = parseFloat(opacitySlider.value);
  const modW = MODULE_WIDTH;
  const modH = MODULE_HEIGHT;

  const traufeM = parseInt(traufeCount.value) * 0.21;
  const ortgangM = parseInt(ortgangCount.value) * 0.33;

  const topLeft = genQuad[0];
  const topRight = genQuad[1];
  const bottomRight = genQuad[2];
  const bottomLeft = genQuad[3];

  modules = [];

  const numRows = Math.floor((ortgangM - MARGIN + GAP) / (modH + GAP));
  const numCols = Math.floor((traufeM - MARGIN + GAP) / (modW + GAP));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#000000";

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const rowT = (r * (modH + GAP) + MARGIN) / ortgangM;
      const rowT2 = ((r + 1) * (modH + GAP) + MARGIN) / ortgangM;
      const colS = (c * (modW + GAP) + MARGIN) / traufeM;
      const colS2 = ((c + 1) * (modW + GAP) + MARGIN) / traufeM;

      const a = lerp(lerp(topLeft, bottomLeft, rowT), lerp(topRight, bottomRight, rowT), colS);
      const b = lerp(lerp(topLeft, bottomLeft, rowT), lerp(topRight, bottomRight, rowT), colS2);
      const c1 = lerp(lerp(topLeft, bottomLeft, rowT2), lerp(topRight, bottomRight, rowT2), colS2);
      const d = lerp(lerp(topLeft, bottomLeft, rowT2), lerp(topRight, bottomRight, rowT2), colS);

      modules.push({
        corners: [a, b, c1, d],
        active: true
      });
    }
  }

  modules.forEach(mod => {
    if (!mod.active) return;
    ctx.beginPath();
    mod.corners.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

showGenBtn.addEventListener("click", () => {
  if (!polygonClosed) return;
  const bounds = {
    xMin: Math.min(...polygon.map(p => p.x)),
    xMax: Math.max(...polygon.map(p => p.x)),
    yMin: Math.min(...polygon.map(p => p.y)),
    yMax: Math.max(...polygon.map(p => p.y))
  };

  const marginPx = MARGIN * pxPerM;

  genQuad = [
    { x: bounds.xMin + marginPx, y: bounds.yMin + marginPx },
    { x: bounds.xMax - marginPx, y: bounds.yMin + marginPx },
    { x: bounds.xMax - marginPx, y: bounds.yMax - marginPx },
    { x: bounds.xMin + marginPx, y: bounds.yMax - marginPx }
  ];

  redraw();
});

clearGenBtn.addEventListener("click", () => {
  genQuad = null;
  redraw();
});
