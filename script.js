const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const resetBtn = document.getElementById("resetBtn");
const info = document.getElementById("info");

const roofImage = document.getElementById("roofImage");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let polygon = [];
let isClosed = false;
let generatorQuad = null;

// Maße
const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;

// Bild laden
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    roofImage.onload = () => {
      canvas.width = roofImage.width;
      canvas.height = roofImage.height;
      reset();
    };
    roofImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Polygon setzen mit größerem Toleranzradius (15px) zum Schließen
canvas.addEventListener("click", (e) => {
  if (!roofImage.src || isClosed) return;

  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };

  if (polygon.length >= 3 && distance(pos, polygon[0]) < 15) {
    polygon.push(polygon[0]); // schließt das Polygon
    isClosed = true;
    computeRoofDimensions();
    createDefaultGeneratorQuad();
    draw();
  } else {
    polygon.push(pos);
    draw();
  }
});

resetBtn.addEventListener("click", () => reset());

function reset() {
  polygon = [];
  isClosed = false;
  generatorQuad = null;
  info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (polygon.length) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    if (isClosed) {
      ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
      ctx.fill();
    }
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const p of polygon) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#00bcd4";
      ctx.fill();
    }

    // Startpunkt hervorheben (grün)
    if (polygon.length > 0) {
      const p0 = polygon[0];
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff00";
      ctx.fill();
    }
  }

  if (generatorQuad) drawModules();
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTileSize() {
  switch (tileType.value) {
    case "einfalz": return { traufe: 0.215, ortgang: 0.33 };
    case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
    case "jumbo": return { traufe: 0.30, ortgang: 0.40 };
    default: return null;
  }
}

function polygonArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum / 2);
}

function computeRoofDimensions() {
  const tile = getTileSize();
  const nTraufe = parseInt(tilesTraufeInput.value, 10);
  const nOrtgang = parseInt(tilesOrtgangInput.value, 10);
  if (!tile || polygon.length < 4) return;

  const traufeM = tile.traufe * nTraufe;
  const ortgangM = tile.ortgang * nOrtgang;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[polygon.length - 2]);
  const scale = ((traufeM / pxTraufe) + (ortgangM / pxOrtgang)) / 2;
  const areaPx = polygonArea(polygon);
  const areaM2 = areaPx * scale * scale;

  info.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;
}

function createDefaultGeneratorQuad() {
  let minX = Math.min(...polygon.map(p => p.x));
  let maxX = Math.max(...polygon.map(p => p.x));
  let minY = Math.min(...polygon.map(p => p.y));
  let maxY = Math.max(...polygon.map(p => p.y));

  const tile = getTileSize();
  const nTraufe = parseInt(tilesTraufeInput.value, 10);
  const nOrtgang = parseInt(tilesOrtgangInput.value, 10);
  const traufeM = tile.traufe * nTraufe;
  const ortgangM = tile.ortgang * nOrtgang;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[polygon.length - 2]);
  const pxPerM = ((traufeM / pxTraufe) + (ortgangM / pxOrtgang)) / 2;

  const marginX = MARGIN * pxPerM;
  const marginY = MARGIN * pxPerM;

  generatorQuad = [
    { x: minX + marginX, y: maxY - marginY },
    { x: maxX - marginX, y: maxY - marginY },
    { x: maxX - marginX, y: minY + marginY },
    { x: minX + marginX, y: minY + marginY }
  ];
}

function drawModules() {
  if (!generatorQuad) return;

  const tile = getTileSize();
  const nTraufe = parseInt(tilesTraufeInput.value, 10);
  const nOrtgang = parseInt(tilesOrtgangInput.value, 10);
  const traufeM = tile.traufe * nTraufe;
  const ortgangM = tile.ortgang * nOrtgang;

  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[polygon.length - 2]);
  const pxPerM = ((traufeM / pxTraufe) + (ortgangM / pxOrtgang)) / 2;

  const modW = MODULE_W * pxPerM;
  const modH = MODULE_H * pxPerM;
  const gap = GAP * pxPerM;

  const [TL, TR, BR, BL] = generatorQuad;

  const cols = Math.floor((distance(TL, TR) + gap) / (modW + gap));
  const rows = Math.floor((distance(TR, BR) + gap) / (modH + gap));

  ctx.fillStyle = "rgba(80,80,80,0.6)";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = TL.x + c * (modW + gap);
      const y = TL.y - (r + 1) * (modH + gap);
      ctx.fillRect(x, y, modW, modH);
    }
  }

  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TL.x, TL.y);
  generatorQuad.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.stroke();
}
