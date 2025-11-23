const fileInput = document.getElementById("fileInput");
const resetPolygonBtn = document.getElementById("resetPolygonBtn");
const pointInfo = document.getElementById("pointInfo");
const imageWrapper = document.getElementById("imageWrapper");
const roofImage = document.getElementById("roofImage");
const overlay = document.getElementById("overlay");

// Referenz / Dachhaut
const roofTypeSelect = document.getElementById("roofType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const measureInfo = document.getElementById("measureInfo");

// Modulraster
const modWidthInput = document.getElementById("modWidth");
const modHeightInput = document.getElementById("modHeight");
const modOrientationSelect = document.getElementById("modOrientation");
const modMarginInput = document.getElementById("modMargin");
const modGapInput = document.getElementById("modGap");
const modOpacityInput = document.getElementById("modOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");

let points = [];
let imgLoaded = false;
let modules = [];
let moduleIdCounter = 1;

// Dachhaut-Spezifikation (cm)
const TILE_TYPES = {
  einfalz: { width_cm: 21.5, height_cm: 33 },
  doppelfalz: { width_cm: 30, height_cm: 33 },
  jumbo: { width_cm: 25, height_cm: 36 },
};

// ---------------- Bild laden ----------------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    roofImage.src = reader.result;
    points = [];
    modules = [];
    imgLoaded = true;
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

// ---------------- Polygon setzen ----------------

// WICHTIG: 1. Punkt = Traufe links unten, 2. Punkt = Traufe rechts unten,
// 3. Punkt = Ortgang oben rechts
imageWrapper.addEventListener("click", (e) => {
  // Klick auf Modul: nur Modul löschen, keine neuen Punkte
  const target = e.target;
  if (target && target.matches("rect[data-module-id]")) {
    return;
  }

  if (!imgLoaded) return;

  const rect = roofImage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const scaleX = roofImage.naturalWidth / rect.width;
  const scaleY = roofImage.naturalHeight / rect.height;
  const imgX = x * scaleX;
  const imgY = y * scaleY;

  points.push({ x: imgX, y: imgY });
  redrawOverlay();
});

resetPolygonBtn.addEventListener("click", () => {
  points = [];
  modules = [];
  clearOverlay();
  pointInfo.textContent = "";
  measureInfo.textContent = "";
  clearModulesBtn.disabled = true;
});

// ---------------- Module zeichnen ----------------

drawModulesBtn.addEventListener("click", () => {
  if (!imgLoaded || points.length < 3) {
    alert("Bitte zuerst ein Bild laden und mindestens 3 Punkte für die Dachfläche setzen.");
    return;
  }

  const modBaseWidth = Number(modWidthInput.value) || 0;
  const modBaseHeight = Number(modHeightInput.value) || 0;
  const margin = Number(modMarginInput.value) || 0;
  const gap = Number(modGapInput.value) || 0;

  if (modBaseWidth <= 0 || modBaseHeight <= 0) {
    alert("Bitte sinnvolle Modulbreite und -höhe eingeben.");
    return;
  }

  // Modulabmessungen je nach Ausrichtung
  let modW = modBaseWidth;
  let modH = modBaseHeight;
  if (modOrientationSelect.value === "vertikal") {
    [modW, modH] = [modH, modW];
  }

  // Begrenzungsrechteck des Polygons
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));

  const innerMinX = minX + margin;
  const innerMaxX = maxX - margin;
  const innerMinY = minY + margin;
  const innerMaxY = maxY - margin;

  const availW = innerMaxX - innerMinX;
  const availH = innerMaxY - innerMinY;

  if (availW <= modW || availH <= modH) {
    alert("Der Modulbereich ist zu klein für die gewählten Modulabmessungen / Rand.");
    return;
  }

  // Wieviele Module passen?
  const countX = Math.floor((availW + gap) / (modW + gap));
  const countY = Math.floor((availH + gap) / (modH + gap));

  if (countX <= 0 || countY <= 0) {
    alert("Es passen keine Module in den gewählten Bereich.");
    return;
  }

  modules = [];
  // Bisherige Module im Overlay entfernen, Polygon bleibt
  const existingModuleRects = Array.from(overlay.querySelectorAll("rect[data-module-id]"));
  existingModuleRects.forEach((r) => r.remove());

  for (let row = 0; row < countY; row++) {
    for (let col = 0; col < countX; col++) {
      const x = innerMinX + col * (modW + gap);
      const y = innerMinY + row * (modH + gap);
      const id = moduleIdCounter++;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", modW);
      rect.setAttribute("height", modH);
      rect.setAttribute("fill", "black");
      rect.setAttribute("fill-opacity", modOpacityInput.value);
      rect.setAttribute("stroke", "white");
      rect.setAttribute("stroke-width", "1");
      rect.dataset.moduleId = String(id);

      // Modul durch Klick löschen
      rect.addEventListener("click", (ev) => {
        ev.stopPropagation();
        rect.remove();
        modules = modules.filter((m) => m.id !== id);
        if (modules.length === 0) {
          clearModulesBtn.disabled = true;
        }
      });

      overlay.appendChild(rect);
      modules.push({ id, x, y, w: modW, h: modH });
    }
  }

  clearModulesBtn.disabled = modules.length === 0;
});

clearModulesBtn.addEventListener("click", () => {
  const rects = Array.from(overlay.querySelectorAll("rect[data-module-id]"));
  rects.forEach((r) => r.remove());
  modules = [];
  clearModulesBtn.disabled = true;
});

// Transparenz live anpassen
modOpacityInput.addEventListener("input", () => {
  const rects = Array.from(overlay.querySelectorAll("rect[data-module-id]"));
  rects.forEach((r) => {
    r.setAttribute("fill-opacity", modOpacityInput.value);
  });
});

// ---------------- Referenzmaße Berechnung ----------------

roofTypeSelect.addEventListener("change", updateMeasurements);
tilesTraufeInput.addEventListener("input", updateMeasurements);
tilesOrtgangInput.addEventListener("input", updateMeasurements);

// ---------------- Overlay für Polygon ----------------

function clearOverlay() {
  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }
}

function redrawOverlay() {
  clearOverlay();

  // Polygon-Linien
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

  // Messwerte aktualisieren, wenn Referenz vorhanden
  updateMeasurements();
}

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

// Messwerte (Längen, Fläche) berechnen
function updateMeasurements() {
  measureInfo.textContent = "";

  const typeKey = roofTypeSelect.value;
  const nTraufe = Number(tilesTraufeInput.value);
  const nOrtgang = Number(tilesOrtgangInput.value);

  if (!typeKey || !nTraufe || !nOrtgang || points.length < 3) {
    return; // noch nicht genug Daten
  }

  const spec = TILE_TYPES[typeKey];
  if (!spec) return;

  const p1 = points[0]; // Traufe links unten
  const p2 = points[1]; // Traufe rechts unten
  const p3 = points[2]; // Ortgang oben rechts

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  const pxTraufe = dist(p1, p2);
  const pxOrtgang = dist(p2, p3);

  if (!pxTraufe || !pxOrtgang) return;

  // reale Längen in cm (Ziegelanzahl * Ziegelmaß)
  const traufe_cm = nTraufe * spec.width_cm;
  const ortgang_cm = nOrtgang * spec.height_cm;

  // cm pro Pixel (getrennt für Traufe/Ortgang)
  const cmPerPxTraufe = traufe_cm / pxTraufe;
  const cmPerPxOrtgang = ortgang_cm / pxOrtgang;

  // Mittelwert als einfacher, isotroper Scale-Faktor
  const cmPerPx = (cmPerPxTraufe + cmPerPxOrtgang) / 2;

  // Fläche in Pixeln → Fläche in m²
  const areaPx = polygonAreaPx(points);
  const area_m2 = areaPx * (cmPerPx * cmPerPx) / 10000; // cm² → m²

  const traufe_m = traufe_cm / 100;
  const ortgang_m = ortgang_cm / 100;

  measureInfo.textContent =
    `Traufe: ${traufe_m.toFixed(2)} m, Ortgang: ${ortgang_m.toFixed(2)} m, ` +
    `Fläche: ${area_m2.toFixed(2)} m²`;
}
