const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const traufeInput = document.getElementById("traufe");
const ortgangInput = document.getElementById("ortgang");
const info = document.getElementById("info");
const createBtn = document.getElementById("createGenerator");
const clearBtn = document.getElementById("clearGenerator");
const transparencySlider = document.getElementById("moduleTransparency");

let img = new Image();
let imgLoaded = false;

let polygon = [];
let polygonClosed = false;

let generatorQuad = null;
let draggingIdx = -1;
let isDragging = false;

// Modulkonstanten (m)
const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.30;

// --- Ziegelgrößen ---
function getTileSize() {
  switch (tileType.value) {
    case "einfalz21x33": return { w: 0.215, h: 0.33 };
    case "einfalz25x36": return { w: 0.25, h: 0.36 };
    case "doppelfalz30x33": return { w: 0.30, h: 0.33 };
    case "doppelfalz30x38": return { w: 0.30, h: 0.38 };
    default: return null;
  }
}

// --- Bild laden ---
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      imgLoaded = true;
      canvas.width = img.width;
      canvas.height = img.height;
      draw();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// --- Generatorfläche erstellen ---
createBtn.addEventListener("click", () => {
  const tile = getTileSize();
  if (!tile) return alert("Ziegeltyp wählen!");

  const traufe = parseInt(traufeInput.value, 10);
  const ortgang = parseInt(ortgangInput.value, 10);
  const traufeM = traufe * tile.w;
  const ortgangM = ortgang * tile.h;

  const scaleX = canvas.width / traufeM;
  const scaleY = canvas.height / ortgangM;

  const pxPerM = Math.min(scaleX, scaleY);

  const pxTraufe = traufeM * pxPerM;
  const pxOrtgang = ortgangM * pxPerM;

  const x0 = 100;
  const y0 = 100;
  const x1 = x0 + pxTraufe;
  const y1 = y0 + pxOrtgang;

  generatorQuad = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ];

  generatorQuad.scale = pxPerM;
  generatorQuad.traufeM = traufeM;
  generatorQuad.ortgangM = ortgangM;

  draw();
});

// --- Generatorfläche löschen ---
clearBtn.addEventListener("click", () => {
  generatorQuad = null;
  draw();
});

// --- Zeichnen ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imgLoaded) ctx.drawImage(img, 0, 0);

  if (generatorQuad) {
    drawGeneratorArea();
    drawModules();
  }
}

// --- Generatorfläche zeichnen ---
function drawGeneratorArea() {
  ctx.beginPath();
  ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.stroke();

  generatorQuad.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "lime";
    ctx.fill();
  });
}

// --- Module zeichnen ---
function drawModules() {
  const alpha = parseFloat(transparencySlider.value);
  const g = generatorQuad;
  const pxPerM = g.scale;

  const marginX = MARGIN * pxPerM;
  const marginY = MARGIN * pxPerM;

  const innerTL = {
    x: g[0].x + marginX,
    y: g[0].y + marginY
  };
  const innerTR = {
    x: g[1].x - marginX,
    y: g[1].y + marginY
  };
  const innerBR = {
    x: g[2].x - marginX,
    y: g[2].y - marginY
  };
  const innerBL = {
    x: g[3].x + marginX,
    y: g[3].y - marginY
  };

  const traufeM = g.traufeM - 2 * MARGIN;
  const ortgangM = g.ortgangM - MARGIN; // oben Rand

  const cols = Math.floor((traufeM + GAP) / (MODULE_W + GAP));
  const rows = Math.floor((ortgangM + GAP) / (MODULE_H + GAP));

  info.textContent = `Traufe: ${g.traufeM.toFixed(2)} m, Ortgang: ${g.ortgangM.toFixed(2)} m, Fläche: ${(g.traufeM * g.ortgangM).toFixed(2)} m²`;

  ctx.globalAlpha = alpha;
  for (let r = 0; r < rows; r++) {
    const tY0 = r / rows;
    const tY1 = (r + 1) / rows;
    for (let c = 0; c < cols; c++) {
      const tX0 = c / cols;
      const tX1 = (c + 1) / cols;

      const a = lerp(lerp(innerTL, innerBL, tY0), lerp(innerTR, innerBR, tY0), tX0);
      const b = lerp(lerp(innerTL, innerBL, tY0), lerp(innerTR, innerBR, tY0), tX1);
      const d = lerp(lerp(innerTL, innerBL, tY1), lerp(innerTR, innerBR, tY1), tX0);
      const e = lerp(lerp(innerTL, innerBL, tY1), lerp(innerTR, innerBR, tY1), tX1);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = "black";
      ctx.fill();

      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}
