// --- Konstanten ------------------------------------------------------------

// Dachziegel-Maße in Metern (Breite = Traufe, Höhe = Ortgang)
const TILE_SPECS = {
  einfalz: { w: 0.215, h: 0.33 },
  doppelpfalz: { w: 0.30, h: 0.33 },
  jumbo: { w: 0.25, h: 0.36 }
};

// PV-Modulmaße in Metern
// vertikal: 1,765 m hoch, 1,134 m breit
const MODULE_SPECS = {
  vertical: { width: 1.134, height: 1.765 },
  horizontal: { width: 1.765, height: 1.134 }
};

const EDGE_MARGIN_M = 0.30; // 30 cm Rand
const GAP_M = 0.02;         // 2 cm Fuge

// --- Canvas / Zustand ------------------------------------------------------

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let image = null;

// Polygon-Dachfläche
let polygon = [];           // [{x,y}, …]
let polygonClosed = false;

// Generatorfläche (4 Punkte, im Uhrzeigersinn: unten links, unten rechts, oben rechts, oben links)
let generator = [];         // [{x,y}, …]

// Dragging-Status
let dragState = null;       // { type: 'polygon'|'generator', index: number }

// Skalen & Maße
let traufePx = 0;
let ortgangPx = 0;
let traufeM = 0;
let ortgangM = 0;
let areaRoofM2 = 0;

// Modul-Raster
let moduleCols = 0;
let moduleRows = 0;
let generatorAreaM2 = 0;

// --- UI-Elemente -----------------------------------------------------------

const fileInput = document.getElementById("fileInput");
const resetPolygonBtn = document.getElementById("resetPolygonBtn");
const pointInfo = document.getElementById("pointInfo");
const measureInfo = document.getElementById("measureInfo");
const moduleInfo = document.getElementById("moduleInfo");

const roofTypeSelect = document.getElementById("roofType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");

const moduleOrientationSelect = document.getElementById("moduleOrientation");
const moduleOpacityInput = document.getElementById("moduleOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");

// --- Hilfsfunktionen -------------------------------------------------------

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

function findNearbyPoint(list, pos, radius) {
  for (let i = 0; i < list.length; i++) {
    if (dist(list[i], pos) <= radius) return i;
  }
  return -1;
}

function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

// --- Zeichnen --------------------------------------------------------------

function redraw() {
  if (!canvas.width || !canvas.height) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (image) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  // Polygon
  if (polygon.length > 0) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "red";
    ctx.fillStyle = "rgba(120,120,120,0.35)";

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
    ctx.fillStyle = "turquoise";
    for (const p of polygon) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Generatorfläche + Modulraster
  if (generator.length === 4 && moduleCols > 0 && moduleRows > 0) {
    const opacity = parseFloat(moduleOpacityInput.value || "0.6");

    // Generatorfläche (Hintergrund)
    ctx.fillStyle = `rgba(60,60,60,${opacity})`;
    ctx.beginPath();
    ctx.moveTo(generator[0].x, generator[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(generator[i].x, generator[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Modulraster (Linien)
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;

    const bl = generator[0];
    const br = generator[1];
    const tr = generator[2];
    const tl = generator[3];

    // vertikale Linien (Spalten)
    for (let c = 0; c <= moduleCols; c++) {
      const u = c / moduleCols;
      const bottom = lerp(bl, br, u);
      const top = lerp(tl, tr, u);
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }

    // horizontale Linien (Zeilen)
    for (let r = 0; r <= moduleRows; r++) {
      const v = r / moduleRows;
      const left = lerp(bl, tl, v);
      const right = lerp(br, tr, v);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }

    // Generator-Eckpunkte zeichnen
    ctx.fillStyle = "deepskyblue";
    for (const p of generator) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- Berechnungen ----------------------------------------------------------

function updateMeasurements() {
  const roofType = roofTypeSelect.value;
  const tilesTraufe = parseFloat(tilesTraufeInput.value);
  const tilesOrtgang = parseFloat(tilesOrtgangInput.value);

  traufeM = 0;
  ortgangM = 0;
  traufePx = 0;
  ortgangPx = 0;
  areaRoofM2 = 0;

  if (!roofType || !TILE_SPECS[roofType]) {
    measureInfo.textContent = "";
    return;
  }
  const spec = TILE_SPECS[roofType];

  if (!polygonClosed || polygon.length < 3) {
    measureInfo.textContent =
      "  (Dachfläche noch nicht vollständig gesetzt)";
    return;
  }

  if (!Number.isFinite(tilesTraufe) || !Number.isFinite(tilesOrtgang)) {
    measureInfo.textContent = "  (Ziegel-Anzahlen fehlen)";
    return;
  }

  // Annahme entsprechend deiner Zeichensequenz:
  // P0 = Traufe links, P1 = Traufe rechts, P2 = Ortgang rechts oben
  const p0 = polygon[0];
  const p1 = polygon[1];
  const p2 = polygon[2];

  traufePx = dist(p0, p1);
  ortgangPx = dist(p1, p2);

  traufeM = tilesTraufe * spec.w;
  ortgangM = tilesOrtgang * spec.h;

  if (traufePx <= 0 || ortgangPx <= 0) {
    measureInfo.textContent = "  (Referenzkanten unklar)";
    return;
  }

  const scaleX = traufeM / traufePx; // m/px
  const scaleY = ortgangM / ortgangPx; // m/px

  const areaPx2 = polygonArea(polygon);
  areaRoofM2 = areaPx2 * scaleX * scaleY;

  measureInfo.textContent =
    `  Traufe: ${traufeM.toFixed(2)} m, ` +
    `Ortgang: ${ortgangM.toFixed(2)} m, ` +
    `Fläche: ${areaRoofM2.toFixed(2)} m²`;

  // nach Referenz-Update auch Modulraster neu berechnen
  updateModuleLayout();
}

function updateModuleLayout() {
  moduleCols = 0;
  moduleRows = 0;
  generatorAreaM2 = 0;

  if (!polygonClosed || polygon.length < 3 || traufeM <= 0 || ortgangM <= 0) {
    moduleInfo.textContent = "";
    redraw();
    return;
  }

  const ori = moduleOrientationSelect.value || "vertical";
  const mSpec = MODULE_SPECS[ori];

  const availW = Math.max(0, traufeM - 2 * EDGE_MARGIN_M);
  const availH = Math.max(0, ortgangM - 2 * EDGE_MARGIN_M);

  if (availW <= 0 || availH <= 0) {
    moduleInfo.textContent = "  (zu wenig Platz für Randabstand 30 cm)";
    redraw();
    return;
  }

  const stepW = mSpec.width + GAP_M;
  const stepH = mSpec.height + GAP_M;

  let cols = Math.floor((availW + GAP_M) / stepW);
  let rows = Math.floor((availH + GAP_M) / stepH);

  if (cols < 1 || rows < 1) {
    moduleInfo.textContent =
      "  (Module passen mit Rand & Fuge nicht auf diese Fläche)";
    redraw();
    return;
  }

  moduleCols = cols;
  moduleRows = rows;

  // Netto-Modulfläche (ohne Fugen)
  generatorAreaM2 = cols * rows * mSpec.width * mSpec.height;

  const totalW = cols * mSpec.width + (cols - 1) * GAP_M;
  const totalH = rows * mSpec.height + (rows - 1) * GAP_M;

  moduleInfo.textContent =
    `  Module: ${cols} × ${rows} = ${cols * rows} Stück, ` +
    `Generatorfläche (Module): ${generatorAreaM2.toFixed(2)} m², ` +
    `Raster ca. ${totalW.toFixed(2)} m × ${totalH.toFixed(2)} m inkl. Fugen`;

  redraw();
}

// --- Generatorfläche initial aus Polygon ableiten --------------------------

function initGeneratorFromPolygon() {
  if (!polygonClosed || polygon.length < 3) return;

  // Annahme: P0 = unten links, P1 = unten rechts, P2 = oben rechts, P3 = oben links
  const p0 = polygon[0];
  const p1 = polygon[1];
  const p2 = polygon[2];
  const p3 = polygon[3] || {
    x: polygon[0].x + (polygon[3] ? 0 : (polygon[0].x - polygon[1].x)),
    y: polygon[2].y
  };

  generator = [ { ...p0 }, { ...p1 }, { ...p2 }, { ...p3 } ];
}

// --- Event-Handler ---------------------------------------------------------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      polygon = [];
      polygonClosed = false;
      generator = [];
      pointInfo.textContent = "";
      measureInfo.textContent = "";
      moduleInfo.textContent = "";
      redraw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

resetPolygonBtn.addEventListener("click", () => {
  polygon = [];
  polygonClosed = false;
  generator = [];
  traufeM = 0;
  ortgangM = 0;
  areaRoofM2 = 0;
  moduleCols = 0;
  moduleRows = 0;
  generatorAreaM2 = 0;
  pointInfo.textContent = "";
  measureInfo.textContent = "";
  moduleInfo.textContent = "";
  clearModulesBtn.disabled = true;
  redraw();
});

roofTypeSelect.addEventListener("change", updateMeasurements);
tilesTraufeInput.addEventListener("input", updateMeasurements);
tilesOrtgangInput.addEventListener("input", updateMeasurements);

moduleOrientationSelect.addEventListener("change", () => {
  updateModuleLayout();
});
moduleOpacityInput.addEventListener("input", redraw);

drawModulesBtn.addEventListener("click", () => {
  if (!polygonClosed || polygon.length < 3) {
    alert("Bitte zuerst die Dachfläche vollständig markieren.");
    return;
  }
  updateMeasurements();
  if (moduleCols === 0 || moduleRows === 0) {
    alert("Mit den aktuellen Referenzwerten passen keine Module auf diese Fläche.");
    return;
  }

  if (generator.length !== 4) {
    initGeneratorFromPolygon();
  }

  clearModulesBtn.disabled = false;
  redraw();
});

clearModulesBtn.addEventListener("click", () => {
  generator = [];
  moduleCols = 0;
  moduleRows = 0;
  generatorAreaM2 = 0;
  moduleInfo.textContent = "";
  clearModulesBtn.disabled = true;
  redraw();
});

// Canvas-Maussteuerung
canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);

  // 1. Generator-Eckpunkte zuerst prüfen
  if (generator.length === 4) {
    const gi = findNearbyPoint(generator, pos, 10);
    if (gi !== -1) {
      dragState = { type: "generator", index: gi };
      return;
    }
  }

  // 2. Polygon-Punkte prüfen
  const pi = findNearbyPoint(polygon, pos, 8);
  if (pi !== -1) {
    dragState = { type: "polygon", index: pi };
    return;
  }

  // 3. Polygon setzen / schließen
  if (!polygonClosed) {
    if (polygon.length >= 3 && dist(pos, polygon[0]) < 10) {
      polygonClosed = true;
      pointInfo.textContent = `Punkte: ${polygon.length}`;
      updateMeasurements();
      redraw();
    } else {
      polygon.push(pos);
      pointInfo.textContent = `Punkte: ${polygon.length}`;
      redraw();
    }
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!dragState) return;
  const pos = getMousePos(e);

  if (dragState.type === "polygon") {
    polygon[dragState.index] = pos;
    if (polygonClosed) updateMeasurements();
  } else if (dragState.type === "generator") {
    generator[dragState.index] = pos;
  }
  redraw();
});

canvas.addEventListener("mouseup", () => {
  dragState = null;
});

canvas.addEventListener("mouseleave", () => {
  dragState = null;
});

// Initial
redraw();
