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
let generatorTransformed = [];
let moduleGrid = [];

const tileDimensions = {
  einfalt: [0.21, 0.33],
  einfaltJumbo: [0.24, 0.40],
  doppelfalz: [0.30, 0.33],
  doppelfalzJumbo: [0.30, 0.40],
};

const moduleWidth = 1.134 + 0.02; // m
const moduleHeight = 1.765 + 0.02; // m
const randAbstand = 0.3;

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
      generatorTransformed = [];
      moduleGrid = [];
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

  if (polygon.length >= 3 && distance(x, y, polygon[0].x, polygon[0].y) < 10) {
    polygonClosed = true;
    calculateGeneratorfläche();
    return;
  }

  polygon.push({ x, y });
  redraw();
});

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imageLoaded) {
    ctx.drawImage(image, 0, 0);
  }

  // Dachfläche zeichnen
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

    for (const p of polygon) {
      ctx.fillStyle = "cyan";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Generatorfläche zeichnen (perspektivisch)
  if (generatorTransformed.length === 4) {
    ctx.beginPath();
    ctx.moveTo(generatorTransformed[0].x, generatorTransformed[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(generatorTransformed[i].x, generatorTransformed[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fill();
    ctx.strokeStyle = "lime";
    ctx.stroke();
  }

  // Modulraster (optional)
  ctx.globalAlpha = opacitySlider.value;
  ctx.fillStyle = "black";
  ctx.strokeStyle = "white";
  moduleGrid.forEach(rect => {
    ctx.beginPath();
    ctx.moveTo(...project(rect[0]));
    for (let i = 1; i < rect.length; i++) {
      ctx.lineTo(...project(rect[i]));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  updateInfo();
}

function calculateGeneratorfläche() {
  const ziegeltyp = tileSelect.value;
  const [tileW, tileH] = tileDimensions[ziegeltyp] || tileDimensions["einfalt"];
  const traufeAnz = parseInt(traufeInput.value);
  const ortgangAnz = parseInt(ortgangInput.value);

  const traufeL = traufeAnz * tileW;
  const ortgangL = ortgangAnz * tileH;

  const nettoW = traufeL - 2 * randAbstand;
  const nettoH = ortgangL - randAbstand;

  const cols = Math.floor(nettoW / moduleWidth);
  const rows = Math.floor(nettoH / moduleHeight);

  const genW = cols * moduleWidth;
  const genH = rows * moduleHeight;

  // Generatorfläche in Originalkoordinaten (oben links → im Polygon)
  const src = [
    { x: 0, y: 0 },
    { x: genW, y: 0 },
    { x: genW, y: genH },
    { x: 0, y: genH }
  ];

  // Zielpunkte (Polygonpunkte → Traufe unten)
  const dst = [polygon[0], polygon[1], polygon[2], polygon[3]];

  generatorTransformed = dst;

  moduleGrid = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * moduleWidth + 0.01;
      const y = row * moduleHeight + 0.01;
      const w = moduleWidth - 0.02;
      const h = moduleHeight - 0.02;
      const quad = [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h }
      ];
      moduleGrid.push(quad);
    }
  }
}

function project(p) {
  // Nutze homographische Approximation (einfach) für aktuelle Fläche
  const [tl, tr, br, bl] = generatorTransformed;
  const x = p.x / (moduleWidth * Math.floor((traufeInput.value * tileDimensions[tileSelect.value][0] - 2 * randAbstand) / moduleWidth));
  const y = p.y / (moduleHeight * Math.floor((ortgangInput.value * tileDimensions[tileSelect.value][1] - randAbstand) / moduleHeight));
  const top = {
    x: tl.x + (tr.x - tl.x) * x,
    y: tl.y + (tr.y - tl.y) * x,
  };
  const bottom = {
    x: bl.x + (br.x - bl.x) * x,
    y: bl.y + (br.y - bl.y) * x,
  };
  return [
    top.x + (bottom.x - top.x) * y,
    top.y + (bottom.y - top.y) * y,
  ];
}

function updateInfo() {
  const ziegeltyp = tileSelect.value;
  const [tileW, tileH] = tileDimensions[ziegeltyp] || [0.21, 0.33];
  const traufe = (traufeInput.value * tileW).toFixed(2);
  const ortgang = (ortgangInput.value * tileH).toFixed(2);
  const fläche = (traufe * ortgang).toFixed(2);
  info.textContent = `Traufe: ${traufe} m, Ortgang: ${ortgang} m, Fläche: ${fläche} m²`;
}
