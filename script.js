// DOM-Elemente
const fileInput = document.getElementById("fileInput");
const resetPolygonBtn = document.getElementById("resetPolygonBtn");
const pointInfo = document.getElementById("pointInfo");
const imageWrapper = document.getElementById("imageWrapper");
const roofImage = document.getElementById("roofImage");
const overlay = document.getElementById("overlay");

const roofTypeSelect = document.getElementById("roofType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const measureInfo = document.getElementById("measureInfo");

const modOpacityInput = document.getElementById("modOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");

// Zustand
let points = [];
let imgLoaded = false;
let polygonClosed = false;

let modules = [];
let moduleIdCounter = 1;

let cmPerPx = null; // globaler Maßstab

// Modul-/Rand-Konstanten (nur Berechnung, nicht sichtbar)
const MODULE_WIDTH_CM = 113.4;   // Breite, wenn vertikal montiert
const MODULE_HEIGHT_CM = 176.5;  // Höhe, wenn vertikal montiert
const MODULE_GAP_CM = 2;         // Fuge in beide Richtungen
const EDGE_MARGIN_CM = 30;       // Rand zu Dachkante

// Dachhaut-Spezifikation (cm)
const TILE_TYPES = {
  einfalz: { width_cm: 21.5, height_cm: 33 },
  doppelfalz: { width_cm: 30, height_cm: 33 },
  jumbo: { width_cm: 25, height_cm: 36 },
};

// Modulgruppe & Handles für affine Anpassung
let modulesGroup = null;
let modulesBaseWidth = 0;
let modulesBaseHeight = 0;
let handlesGroup = null;
let handlePoints = null; // 0,1,2,3 = Eckpunkte
let draggingHandleIndex = null;

// ---------------- Bild laden ----------------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    roofImage.src = reader.result;
    imgLoaded = true;
    points = [];
    polygonClosed = false;
    modules = [];
    cmPerPx = null;
    resetPolygonBtn.disabled = false;
    clearModulesBtn.disabled = true;
    pointInfo.textContent = "";
    measureInfo.textContent = "";
    clearOverlay();
  };
  reader.readAsDataURL(file);
});

roofImage.addEventListener("load", () => {
  overlay.setAttribute("viewBox", `0 0 ${roofImage.naturalWidth} ${roofImage.naturalHeight}`);
});

// ---------------- Polygon setzen & schließen ----------------

imageWrapper.addEventListener("click", (e) => {
  // Klicks auf Module: nur Modul-Handler, keine Punkte hinzufügen
  const t = e.target;
  if (t && t.matches("rect[data-module-id]")) {
    return;
  }

  if (!imgLoaded) return;
  if (polygonClosed) return; // nach Schließen keine weiteren Punkte

  const rect = roofImage.getBoundingClientRect();
  const scaleX = roofImage.naturalWidth / rect.width;
  const scaleY = roofImage.naturalHeight / rect.height;
  const imgX = (e.clientX - rect.left) * scaleX;
  const imgY = (e.clientY - rect.top) * scaleY;

  if (points.length >= 3) {
    const first = points[0];
    const distFirst = Math.hypot(imgX - first.x, imgY - first.y);
    const thresholdPx = 20 * scaleX; // Snap-Radius in Bildpixeln

    // Klick in der Nähe des ersten Punktes -> Polygon schließen
    if (distFirst < thresholdPx) {
      polygonClosed = true;
      redrawOverlay();
      return;
    }
  }

  points.push({ x: imgX, y: imgY });
  redrawOverlay();
});

resetPolygonBtn.addEventListener("click", () => {
  points = [];
  polygonClosed = false;
  cmPerPx = null;
  modules = [];
  clearOverlay();
  pointInfo.textContent = "";
  measureInfo.textContent = "";
  clearModulesBtn.disabled = true;
});

// ---------------- Module zeichnen ----------------

drawModulesBtn.addEventListener("click", () => {
  if (!imgLoaded) {
    alert("Bitte zuerst ein Dachfoto laden.");
    return;
  }
  if (!polygonClosed || points.length < 3) {
    alert("Bitte das Polygon schließen, indem Sie den letzten Punkt auf den ersten Punkt setzen.");
    return;
  }
  if (!updateMeasurements(true)) {
    alert("Bitte Dachhaut und Ziegelanzahl Traufe/Ortgang korrekt setzen.");
    return;
  }
  if (!cmPerPx || cmPerPx <= 0) {
    alert("Maßstab konnte nicht bestimmt werden.");
    return;
  }

  // Modul- und Fugenabstände in Pixel
  const modW_px = MODULE_WIDTH_CM / cmPerPx;
  const modH_px = MODULE_HEIGHT_CM / cmPerPx;
  const gap_px = MODULE_GAP_CM / cmPerPx;
  const edgeMargin_px = EDGE_MARGIN_CM / cmPerPx;

  // Begrenzungsrechteck des Polygons
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));

  const innerMinX = minX + edgeMargin_px;
  const innerMaxX = maxX - edgeMargin_px;
  const innerMinY = minY + edgeMargin_px;
  const innerMaxY = maxY - edgeMargin_px;

  const availW = innerMaxX - innerMinX;
  const availH = innerMaxY - innerMinY;

  if (availW <= modW_px || availH <= modH_px) {
    alert("Der Modulbereich ist zu klein für die Modulgröße und den Rand.");
    return;
  }

  // Rasteranzahl (Pitch = Modul + Fuge)
  const pitchW = modW_px + gap_px;
  const pitchH = modH_px + gap_px;

  const countX = Math.floor((availW + gap_px) / pitchW);
  const countY = Math.floor((availH + gap_px) / pitchH);

  if (countX <= 0 || countY <= 0) {
    alert("Es passen keine Module in den Bereich.");
    return;
  }

  // Basis-Koordinatensystem für Module (0..baseW / 0..baseH)
  modulesBaseWidth = countX * modW_px + (countX - 1) * gap_px;
  modulesBaseHeight = countY * modH_px + (countY - 1) * gap_px;

  // Vorherige Module & Handles entfernen
  removeModulesAndHandles();

  modulesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  modulesGroup.setAttribute("id", "modulesGroup");
  overlay.appendChild(modulesGroup);

  modules = [];
  moduleIdCounter = 1;

  for (let row = 0; row < countY; row++) {
    for (let col = 0; col < countX; col++) {
      const x = col * pitchW;
      const y = row * pitchH;
      const id = moduleIdCounter++;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", modW_px);
      rect.setAttribute("height", modH_px);
      rect.setAttribute("fill", "black");
      rect.setAttribute("fill-opacity", modOpacityInput.value);
      rect.setAttribute("stroke", "white");
      rect.setAttribute("stroke-width", "0.5");
      rect.dataset.moduleId = String(id);

      rect.addEventListener("click", (ev) => {
        ev.stopPropagation();
        rect.remove();
        modules = modules.filter((m) => m.id !== id);
        if (modules.length === 0) {
          clearModulesBtn.disabled = true;
        }
      });

      modulesGroup.appendChild(rect);
      modules.push({ id, x, y, w: modW_px, h: modH_px });
    }
  }

  clearModulesBtn.disabled = modules.length > 0;

  // Anfangs-Modulfläche: Rechteck im inneren Bereich
  const startX = innerMinX;
  const startY = innerMinY;

  handlePoints = [
    { x: startX,                 y: startY },                  // 0: oben links
    { x: startX + modulesBaseWidth, y: startY },               // 1: oben rechts
    { x: startX + modulesBaseWidth, y: startY + modulesBaseHeight }, // 2: unten rechts (berechnet)
    { x: startX,                 y: startY + modulesBaseHeight },    // 3: unten links
  ];

  createHandles();
  applyModuleTransform();
});

clearModulesBtn.addEventListener("click", () => {
  removeModulesAndHandles();
  modules = [];
  clearModulesBtn.disabled = true;
});

// Transparenz für existierende Module
modOpacityInput.addEventListener("input", () => {
  const rects = Array.from(overlay.querySelectorAll("rect[data-module-id]"));
  rects.forEach((r) => {
    r.setAttribute("fill-opacity", modOpacityInput.value);
  });
});

// ---------------- Messungen (Längen, Fläche) ----------------

// Wenn force=true: erzwingt Rückgabe true/false, ohne nur still zu aktualisieren
function updateMeasurements(force = false) {
  measureInfo.textContent = "";

  const typeKey = roofTypeSelect.value;
  const nTraufe = Number(tilesTraufeInput.value);
  const nOrtgang = Number(tilesOrtgangInput.value);

  if (!typeKey || !nTraufe || !nOrtgang || points.length < 3) {
    if (force) return false;
    return false;
  }

  const spec = TILE_TYPES[typeKey];
  if (!spec) {
    if (force) return false;
    return false;
  }

  const p1 = points[0]; // Traufe links unten
  const p2 = points[1]; // Traufe rechts unten
  const p3 = points[2]; // Ortgang oben rechts

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  const pxTraufe = dist(p1, p2);
  const pxOrtgang = dist(p2, p3);

  if (!pxTraufe || !pxOrtgang) {
    if (force) return false;
    return false;
  }

  // reale Längen in cm (Anzahl Ziegel * Ziegelmaß)
  const traufe_cm = nTraufe * spec.width_cm;
  const ortgang_cm = nOrtgang * spec.height_cm;

  const cmPerPxTraufe = traufe_cm / pxTraufe;
  const cmPerPxOrtgang = ortgang_cm / pxOrtgang;

  cmPerPx = (cmPerPxTraufe + cmPerPxOrtgang) / 2;

  // Fläche in m²
  const areaPx = polygonAreaPx(points);
  const area_m2 = areaPx * (cmPerPx * cmPerPx) / 10000;

  const traufe_m = traufe_cm / 100;
  const ortgang_m = ortgang_cm / 100;

  measureInfo.textContent =
    `Traufe: ${traufe_m.toFixed(2)} m, Ortgang: ${ortgang_m.toFixed(2)} m, ` +
    `Fläche: ${area_m2.toFixed(2)} m²`;

  return true;
}

roofTypeSelect.addEventListener("change", () => updateMeasurements(false));
tilesTraufeInput.addEventListener("input", () => updateMeasurements(false));
tilesOrtgangInput.addEventListener("input", () => updateMeasurements(false));

// Polygonfläche in Pixeln (Shoelace-Formel)
function polygonAreaPx(pts) {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

// ---------------- Overlay für Polygon ----------------

function clearOverlay() {
  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }
}

function redrawOverlay() {
  // Module & Handles bleiben separat; hier nur Polygon neu zeichnen
  const existingModulesGroup = document.getElementById("modulesGroup");
  const existingHandlesGroup = document.getElementById("moduleHandles");

  const tempModules = existingModulesGroup ? existingModulesGroup : null;
  const tempHandles = existingHandlesGroup ? existingHandlesGroup : null;

  overlay.innerHTML = "";

  if (tempModules) overlay.appendChild(tempModules);
  if (tempHandles) overlay.appendChild(tempHandles);

  // Linien zwischen aufeinanderfolgenden Punkten
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const n = points[i + 1];

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p.x);
    line.setAttribute("y1", p.y);
    line.setAttribute("x2", n.x);
    line.setAttribute("y2", n.y);
    line.setAttribute("stroke", "red");
    line.setAttribute("stroke-width", "2");
    overlay.appendChild(line);
  }

  // Abschlusslinie zum ersten Punkt, wenn Polygon geschlossen
  if (polygonClosed && points.length > 1) {
    const last = points[points.length - 1];
    const first = points[0];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", last.x);
    line.setAttribute("y1", last.y);
    line.setAttribute("x2", first.x);
    line.setAttribute("y2", first.y);
    line.setAttribute("stroke", "red");
    line.setAttribute("stroke-width", "2");
    overlay.appendChild(line);
  }

  // Punkte
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "red");
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "1");
    overlay.appendChild(circle);
  }

  pointInfo.textContent = `Punkte: ${points.length}`;

  // Messwerte aktualisieren (falls Referenzdaten schon gesetzt)
  updateMeasurements(false);
}

// ---------------- Module + Handles (Affine Anpassung) ----------------

function removeModulesAndHandles() {
  if (modulesGroup) {
    modulesGroup.remove();
    modulesGroup = null;
  }
  if (handlesGroup) {
    handlesGroup.remove();
    handlesGroup = null;
  }
  handlePoints = null;
}

function createHandles() {
  if (!handlePoints || handlePoints.length < 4) return;

  if (handlesGroup) {
    handlesGroup.remove();
  }

  handlesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  handlesGroup.setAttribute("id", "moduleHandles");
  overlay.appendChild(handlesGroup);

  // Kreis-Handles + Linien zeichnen
  drawHandlesAndEdges();

  // Drag-Events für 0,1,3 (oben links, oben rechts, unten links)
  const circles = handlesGroup.querySelectorAll("circle");
  circles.forEach((c) => {
    const idx = Number(c.dataset.index);
    if (idx === 2) {
      // berechnete Ecke (unten rechts) -> nicht direkt ziehen
      c.style.cursor = "default";
      c.style.pointerEvents = "none";
      return;
    }
    c.style.cursor = "move";
    c.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      draggingHandleIndex = idx;
      window.addEventListener("mousemove", onHandleMove);
      window.addEventListener("mouseup", onHandleUp);
    });
  });
}

function drawHandlesAndEdges() {
  if (!handlesGroup || !handlePoints) return;

  while (handlesGroup.firstChild) {
    handlesGroup.removeChild(handlesGroup.firstChild);
  }

  const p0 = handlePoints[0];
  const p1 = handlePoints[1];
  const p3 = handlePoints[3];
  // p2 wird aus Parallelogramm berechnet
  const p2 = {
    x: p0.x + (p1.x - p0.x) + (p3.x - p0.x),
    y: p0.y + (p1.y - p0.y) + (p3.y - p0.y),
  };
  handlePoints[2] = p2;

  const pts = [p0, p1, p2, p3, p0];

  // Kanten
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("stroke", "cyan");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-dasharray", "4 2");
    handlesGroup.appendChild(line);
  }

  // Handles zeichnen
  [p0, p1, p2, p3].forEach((p, idx) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", p.x);
    c.setAttribute("cy", p.y);
    c.setAttribute("r", "5");
    c.setAttribute("fill", idx === 2 ? "rgba(0,255,255,0.4)" : "cyan");
    c.setAttribute("stroke", "black");
    c.setAttribute("stroke-width", "1");
    c.dataset.index = String(idx);
    handlesGroup.appendChild(c);
  });
}

function onHandleMove(e) {
  if (draggingHandleIndex === null || !handlePoints) return;

  const rect = roofImage.getBoundingClientRect();
  const scaleX = roofImage.naturalWidth / rect.width;
  const scaleY = roofImage.naturalHeight / rect.height;
  const imgX = (e.clientX - rect.left) * scaleX;
  const imgY = (e.clientY - rect.top) * scaleY;

  const idx = draggingHandleIndex;
  if (idx === 2) return; // sicherheitshalber

  handlePoints[idx] = { x: imgX, y: imgY };
  drawHandlesAndEdges();
  applyModuleTransform();
}

function onHandleUp() {
  draggingHandleIndex = null;
  window.removeEventListener("mousemove", onHandleMove);
  window.removeEventListener("mouseup", onHandleUp);
}

// Affine Abbildung: Basis-Rechteck (0..baseW, 0..baseH) -> Parallelogramm (p0,p1,p3)
function applyModuleTransform() {
  if (!modulesGroup || !handlePoints || modulesBaseWidth <= 0 || modulesBaseHeight <= 0) return;

  const p0 = handlePoints[0];
  const p1 = handlePoints[1];
  const p3 = handlePoints[3];

  const f1 = { x: p1.x - p0.x, y: p1.y - p0.y };
  const f2 = { x: p3.x - p0.x, y: p3.y - p0.y };

  const a = f1.x / modulesBaseWidth;
  const b = f1.y / modulesBaseWidth;
  const c = f2.x / modulesBaseHeight;
  const d = f2.y / modulesBaseHeight;
  const e = p0.x;
  const f = p0.y;

  modulesGroup.setAttribute("transform", `matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
}
