const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const resetBtn = document.getElementById("resetBtn");
const info = document.getElementById("info");

const roofImage = document.getElementById("roofImage");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let generatorQuad = null;
let polygon = [];
let polygonClosed = false;
let draggingIndex = -1;
let traufeM = 0;
let ortgangM = 0;
let areaM2 = 0;

// Modul-Parameter
const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;

canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);

  // Teste Generatorpunkte
  if (generatorQuad) {
    draggingIndex = findHandleIndex(generatorQuad, pos, 10);
    if (draggingIndex >= 0) return;
  }

  // Dachfläche setzen
  if (!polygonClosed) {
    if (polygon.length >= 3 && distance(pos, polygon[0]) < 10) {
      polygonClosed = true;
    } else {
      polygon.push(pos);
    }
    draw();
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (draggingIndex >= 0 && generatorQuad) {
    generatorQuad[draggingIndex] = getMousePos(e);
    draw();
  }
});

canvas.addEventListener("mouseup", () => draggingIndex = -1);

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    roofImage.onload = () => {
      canvas.width = roofImage.width;
      canvas.height = roofImage.height;

      polygon = [];
      polygonClosed = false;
      generatorQuad = null;

      draw();
    };
    roofImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

resetBtn.addEventListener("click", () => {
  polygon = [];
  polygonClosed = false;
  generatorQuad = null;
  traufeM = 0;
  ortgangM = 0;
  areaM2 = 0;
  info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
  draw();
});

tileType.addEventListener("change", computeMeasurements);
tilesTraufeInput.addEventListener("input", computeMeasurements);
tilesOrtgangInput.addEventListener("input", computeMeasurements);

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
