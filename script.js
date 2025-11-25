const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const info = document.getElementById("info");
const drawGeneratorBtn = document.getElementById("drawGeneratorBtn");
const clearGeneratorBtn = document.getElementById("clearGeneratorBtn");

const image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;

let generatorQuad = null;
let scaleMtoPx = 1;
let draggingHandle = -1;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.30;
const HANDLE_RADIUS = 6;

// Bild laden
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    image.onload = () => {
      imageLoaded = true;
      const maxWidth = 1000;
      const scale = Math.min(maxWidth / image.width, 1);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      image.scaledWidth = canvas.width;
      image.scaledHeight = canvas.height;

      polygon = [];
      polygonClosed = false;
      generatorQuad = null;
      draw();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

function draw() {
  if (!imageLoaded) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

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
    ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
    ctx.beginPath();
    ctx.moveTo(generatorQuad
