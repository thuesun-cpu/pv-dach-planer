const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufe = document.getElementById("tilesTraufe");
const tilesOrtgang = document.getElementById("tilesOrtgang");
const info = document.getElementById("info");

let image = null;
let polygonPoints = [];
let closed = false;

const tileDimensions = {
  "21x33": { w: 21, h: 33 },
  "24x40": { w: 24, h: 40 },
  "30x33": { w: 30, h: 33 },
  "30x40": { w: 30, h: 40 }
};

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (event) {
    image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      polygonPoints = [];
      closed = false;
      draw();
    };
    image.src = event.target.result;
  };
  if (file) {
    reader.readAsDataURL(file);
  }
});

canvas.addEventListener("click", (e) => {
  if (!image || closed) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (polygonPoints.length > 2) {
    const [firstX, firstY] = polygonPoints[0];
    const dx = x - firstX;
    const dy = y - firstY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) {
      closed = true;
      draw();
      return;
    }
  }

  polygonPoints.push([x, y]);
  draw();
});

function drawPolygon() {
  if (polygonPoints.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(polygonPoints[0][0], polygonPoints[0][1]);
  for (let i = 1; i < polygonPoints.length; i++) {
    ctx.lineTo(polygonPoints[i][0], polygonPoints[i][1]);
  }
  if (closed) {
    ctx.lineTo(polygonPoints[0][0], polygonPoints[0][1]);
    ctx.closePath();
  }
  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Punkte
  for (const [x, y] of polygonPoints) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "cyan";
    ctx.fill();
  }
}

function draw() {
  if (!image) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  drawPolygon();
  updateMeasurements();
}

function updateMeasurements() {
  if (!closed || polygonPoints.length < 4) {
    info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
    return;
  }

  const type = tileType.value;
  const dims = tileDimensions[type];
  const traufZiegel = parseInt(tilesTraufe.value);
  const ortgZiegel = parseInt(tilesOrtgang.value);

  const traufe = (traufZiegel * dims.w) / 100;
  const ortgang = (ortgZiegel * dims.h) / 100;
  const flaeche = (traufZiegel * dims.w * ortgZiegel * dims.h) / 10000;

  info.textContent = `Traufe: ${traufZiegel} = ${traufZiegel * dims.w / 100} m, Ortgang: ${ortgZiegel} = ${ortgZiegel * dims.h / 100} m, Fläche: ${flaeche.toFixed(2)} m²`;
}
