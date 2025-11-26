const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const tileSelect = document.getElementById("tileSelect");
const traufeInput = document.getElementById("traufe");
const ortgangInput = document.getElementById("ortgang");
const opacitySlider = document.getElementById("opacity");
const info = document.getElementById("info");

let image = new Image();
let imageLoaded = false;
let polygon = [];
let polygonClosed = false;
let generatorQuad = [];

const moduleWidth = 1.134 + 0.02;
const moduleHeight = 1.765 + 0.02;
const randAbstand = 0.3;

const tileDimensions = {
  einfalt: [0.21, 0.33],
  einfaltJumbo: [0.24, 0.40],
  doppelfalz: [0.30, 0.33],
  doppelfalzJumbo: [0.30, 0.40],
};

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
      generatorQuad = [];
      redraw();
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("click", function (e) {
  if (!imageLoaded || polygonClosed) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const clickPos = { x, y };

  if (polygon.length >= 3 && distance(clickPos, polygon[0]) < 10) {
    polygonClosed = true;
    calculateGeneratorQuad();
    redraw();
    return;
  }

  polygon.push(clickPos);
  redraw();
});

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) {
    ctx.drawImage(image, 0, 0);
  }

  // Dachpolygon
  if (polygon.length > 0) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }

    if (polygonClosed) {
      ctx.closePath();
      ctx.strokeStyle = "red";
      ctx.stroke();
    } else {
      ctx.strokeStyle = "blue";
      ctx.stroke();
    }

    for (const point of polygon) {
      ctx.fillStyle = "cyan";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Generatorfläche
  if (generatorQuad.length === 4) {
    ctx.beginPath();
    ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
    ctx.lineTo(generatorQuad[1].x, generatorQuad[1].y);
    ctx.lineTo(generatorQuad[2].x, generatorQuad[2].y);
    ctx.lineTo(generatorQuad[3].x, generatorQuad[3].y);
    ctx.closePath();

    ctx.fillStyle = "rgba(0,255,0," + opacitySlider.value + ")";
    ctx.fill();
    ctx.strokeStyle = "green";
    ctx.stroke();
  }

  updateInfo();
}

function calculateGeneratorQuad() {
  const ziegeltyp = tileSelect.value;
  const [tileW, tileH] = tileDimensions[ziegeltyp] || [0.21, 0.33];
  const traufe = parseInt(traufeInput.value) * tileW;
  const ortgang = parseInt(ortgangInput.value) * tileH;

  const genW = traufe - 2 * randAbstand;
  const genH = ortgang - randAbstand;

  // Projektive Annahme: Polygon = [unten links, unten rechts, oben rechts, oben links]
  if (polygon.length >= 4) {
    generatorQuad = [
      interpolate(polygon[3], polygon[0], randAbstand / ortgang), // oben links
      interpolate(polygon[2], polygon[1], randAbstand / ortgang), // oben rechts
      interpolate(polygon[1], polygon[2], (traufe - randAbstand) / traufe), // unten rechts
      interpolate(polygon[0], polygon[3], (traufe - randAbstand) / traufe), // unten links
    ];
  }
}

function interpolate(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}

function updateInfo() {
  const ziegeltyp = tileSelect.value;
  const [tileW, tileH] = tileDimensions[ziegeltyp] || [0.21, 0.33];
  const traufe = (traufeInput.value * tileW).toFixed(2);
  const ortgang = (ortgangInput.value * tileH).toFixed(2);
  const flaeche = (traufe * ortgang).toFixed(2);
  info.textContent = `Traufe: ${traufe} m, Ortgang: ${ortgang} m, Fläche: ${flaeche} m²`;
}
