const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const imageLoader = document.getElementById("imageLoader");
const tileType = document.getElementById("tileType");
const tileTraufe = document.getElementById("tileTraufe");
const tileOrtgang = document.getElementById("tileOrtgang");
const info = document.getElementById("info");
const resetBtn = document.getElementById("reset");
const moduleOrientation = document.getElementById("moduleOrientation");
const transparency = document.getElementById("transparency");

let image = null;
let polygonPoints = [];
let closed = false;
let isDragging = false;
let dragIndex = -1;
let generatorArea = null;

const moduleWidth = 1.134; // m
const moduleHeight = 1.765; // m
const moduleGap = 0.02; // m
const margin = 0.3; // m

function getTileWidth(type) {
  switch (type) {
    case "einfalz": return 21;
    case "einfalzjumbo": return 24;
    case "doppelfalz": return 30;
    case "doppelfalzjumbo": return 30;
    default: return 0;
  }
}

function getTileHeight(type) {
  switch (type) {
    case "einfalz": return 33;
    case "einfalzjumbo": return 40;
    case "doppelfalz": return 33;
    case "doppelfalzjumbo": return 40;
    default: return 0;
  }
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (image) ctx.drawImage(image, 0, 0);

  // Draw Polygon
  if (polygonPoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (closed) ctx.closePath();
    ctx.strokeStyle = "purple";
    ctx.lineWidth = 2;
    ctx.stroke();

    polygonPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "purple";
      ctx.fill();
    });
  }

  // Draw Generatorfläche
  if (closed && generatorArea) {
    ctx.fillStyle = "rgba(255,255,255," + transparency.value + ")";
    ctx.fillRect(generatorArea.x, generatorArea.y, generatorArea.width, generatorArea.height);
    ctx.strokeStyle = "green";
    ctx.lineWidth = 2;
    ctx.strokeRect(generatorArea.x, generatorArea.y, generatorArea.width, generatorArea.height);
  }
}

function updateMeasurements() {
  if (!closed || polygonPoints.length < 4) {
    info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
    return;
  }

  const traufeZiegel = parseInt(tileTraufe.value);
  const ortgangZiegel = parseInt(tileOrtgang.value);
  const breite = getTileWidth(tileType.value) * traufeZiegel / 100;
  const hoehe = getTileHeight(tileType.value) * ortgangZiegel / 100;
  const flaeche = breite * hoehe;

  info.textContent =
    `Traufe: ${breite.toFixed(2)} m, Ortgang: ${hoehe.toFixed(2)} m, Fläche: ${flaeche.toFixed(2)} m²`;
}

function createGeneratorAreaFromPolygon() {
  if (polygonPoints.length < 4) return;

  const p0 = polygonPoints[0];
  const p1 = polygonPoints[1];
  const p3 = polygonPoints[3];

  const traufePx = distance(p0.x, p0.y, p1.x, p1.y);
  const ortgangPx = distance(p0.x, p0.y, p3.x, p3.y);

  const traufeM = getTileWidth(tileType.value) * parseInt(tileTraufe.value) / 100;
  const ortgangM = getTileHeight(tileType.value) * parseInt(tileOrtgang.value) / 100;

  const scaleX = traufeM / traufePx;
  const scaleY = ortgangM / ortgangPx;
  const scale = (scaleX + scaleY) / 2;

  const marginX = 0.3 * scalePx(traufeM, traufePx);
  const marginY = 0.3 * scalePx(ortgangM, ortgangPx);

  generatorArea = {
    x: p0.x + marginX,
    y: p0.y + marginY,
    width: traufePx - 2 * marginX,
    height: ortgangPx - marginY
  };
}

function scalePx(meter, px) {
  return px / meter;
}

canvas.addEventListener("mousedown", function (e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (!closed) {
    if (polygonPoints.length >= 3 && distance(x, y, polygonPoints[0].x, polygonPoints[0].y) < 10) {
      closed = true;
      updateMeasurements();
      createGeneratorAreaFromPolygon();
      drawCanvas();
      return;
    }

    polygonPoints.push({ x, y });
    drawCanvas();
  } else {
    for (let i = 0; i < polygonPoints.length; i++) {
      if (distance(x, y, polygonPoints[i].x, polygonPoints[i].y) < 10) {
        isDragging = true;
        dragIndex = i;
        return;
      }
    }
  }
});

canvas.addEventListener("mousemove", function (e) {
  if (!isDragging || dragIndex === -1) return;

  const rect = canvas.getBoundingClientRect();
  polygonPoints[dragIndex].x = e.clientX - rect.left;
  polygonPoints[dragIndex].y = e.clientY - rect.top;
  drawCanvas();
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  dragIndex = -1;
});

imageLoader.addEventListener("change", function (e) {
  const reader = new FileReader();
  reader.onload = function (event) {
    image = new Image();
    image.onload = () => {
      drawCanvas();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
});

resetBtn.addEventListener("click", () => {
  polygonPoints = [];
  closed = false;
  generatorArea = null;
  drawCanvas();
  info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
});

tileType.addEventListener("change", updateMeasurements);
tileTraufe.addEventListener("input", updateMeasurements);
tileOrtgang.addEventListener("input", updateMeasurements);
moduleOrientation.addEventListener("change", drawCanvas);
transparency.addEventListener("input", drawCanvas);

// Initialer Aufruf
drawCanvas();
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const imageLoader = document.getElementById("imageLoader");
const tileType = document.getElementById("tileType");
const tileTraufe = document.getElementById("tileTraufe");
const tileOrtgang = document.getElementById("tileOrtgang");
const info = document.getElementById("info");
const resetBtn = document.getElementById("reset");
const moduleOrientation = document.getElementById("moduleOrientation");
const transparency = document.getElementById("transparency");

let image = null;
let polygonPoints = [];
let closed = false;
let isDragging = false;
let dragIndex = -1;
let generatorArea = null;

const moduleWidth = 1.134; // m
const moduleHeight = 1.765; // m
const moduleGap = 0.02; // m
const margin = 0.3; // m

function getTileWidth(type) {
  switch (type) {
    case "einfalz": return 21;
    case "einfalzjumbo": return 24;
    case "doppelfalz": return 30;
    case "doppelfalzjumbo": return 30;
    default: return 0;
  }
}

function getTileHeight(type) {
  switch (type) {
    case "einfalz": return 33;
    case "einfalzjumbo": return 40;
    case "doppelfalz": return 33;
    case "doppelfalzjumbo": return 40;
    default: return 0;
  }
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (image) ctx.drawImage(image, 0, 0);

  // Draw Polygon
  if (polygonPoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (closed) ctx.closePath();
    ctx.strokeStyle = "purple";
    ctx.lineWidth = 2;
    ctx.stroke();

    polygonPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "purple";
      ctx.fill();
    });
  }

  // Draw Generatorfläche
  if (closed && generatorArea) {
    ctx.fillStyle = "rgba(255,255,255," + transparency.value + ")";
    ctx.fillRect(generatorArea.x, generatorArea.y, generatorArea.width, generatorArea.height);
    ctx.strokeStyle = "green";
    ctx.lineWidth = 2;
    ctx.strokeRect(generatorArea.x, generatorArea.y, generatorArea.width, generatorArea.height);
  }
}

function updateMeasurements() {
  if (!closed || polygonPoints.length < 4) {
    info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
    return;
  }

  const traufeZiegel = parseInt(tileTraufe.value);
  const ortgangZiegel = parseInt(tileOrtgang.value);
  const breite = getTileWidth(tileType.value) * traufeZiegel / 100;
  const hoehe = getTileHeight(tileType.value) * ortgangZiegel / 100;
  const flaeche = breite * hoehe;

  info.textContent =
    `Traufe: ${breite.toFixed(2)} m, Ortgang: ${hoehe.toFixed(2)} m, Fläche: ${flaeche.toFixed(2)} m²`;
}

function createGeneratorAreaFromPolygon() {
  if (polygonPoints.length < 4) return;

  const p0 = polygonPoints[0];
  const p1 = polygonPoints[1];
  const p3 = polygonPoints[3];

  const traufePx = distance(p0.x, p0.y, p1.x, p1.y);
  const ortgangPx = distance(p0.x, p0.y, p3.x, p3.y);

  const traufeM = getTileWidth(tileType.value) * parseInt(tileTraufe.value) / 100;
  const ortgangM = getTileHeight(tileType.value) * parseInt(tileOrtgang.value) / 100;

  const scaleX = traufeM / traufePx;
  const scaleY = ortgangM / ortgangPx;
  const scale = (scaleX + scaleY) / 2;

  const marginX = 0.3 * scalePx(traufeM, traufePx);
  const marginY = 0.3 * scalePx(ortgangM, ortgangPx);

  generatorArea = {
    x: p0.x + marginX,
    y: p0.y + marginY,
    width: traufePx - 2 * marginX,
    height: ortgangPx - marginY
  };
}

function scalePx(meter, px) {
  return px / meter;
}

canvas.addEventListener("mousedown", function (e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (!closed) {
    if (polygonPoints.length >= 3 && distance(x, y, polygonPoints[0].x, polygonPoints[0].y) < 10) {
      closed = true;
      updateMeasurements();
      createGeneratorAreaFromPolygon();
      drawCanvas();
      return;
    }

    polygonPoints.push({ x, y });
    drawCanvas();
  } else {
    for (let i = 0; i < polygonPoints.length; i++) {
      if (distance(x, y, polygonPoints[i].x, polygonPoints[i].y) < 10) {
        isDragging = true;
        dragIndex = i;
        return;
      }
    }
  }
});

canvas.addEventListener("mousemove", function (e) {
  if (!isDragging || dragIndex === -1) return;

  const rect = canvas.getBoundingClientRect();
  polygonPoints[dragIndex].x = e.clientX - rect.left;
  polygonPoints[dragIndex].y = e.clientY - rect.top;
  drawCanvas();
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  dragIndex = -1;
});

imageLoader.addEventListener("change", function (e) {
  const reader = new FileReader();
  reader.onload = function (event) {
    image = new Image();
    image.onload = () => {
      drawCanvas();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
});

resetBtn.addEventListener("click", () => {
  polygonPoints = [];
  closed = false;
  generatorArea = null;
  drawCanvas();
  info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
});

tileType.addEventListener("change", updateMeasurements);
tileTraufe.addEventListener("input", updateMeasurements);
tileOrtgang.addEventListener("input", updateMeasurements);
moduleOrientation.addEventListener("change", drawCanvas);
transparency.addEventListener("input", drawCanvas);

// Initialer Aufruf
drawCanvas();
