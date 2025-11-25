const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");

const image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;

fileInput.addEventListener("change", (e) => {
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
      draw();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("mousedown", (e) => {
  if (!imageLoaded || polygonClosed) return;

  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };

  if (polygon.length >= 3 && distance(pos, polygon[0]) < 10) {
    polygonClosed = true;
  } else {
    polygon.push(pos);
  }

  draw();
});

function draw() {
  if (!imageLoaded) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  if (polygon.length === 0) return;

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

  // Punkte
  ctx.fillStyle = "#00bcd4";
  polygon.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
