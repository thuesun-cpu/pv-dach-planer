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
const modOrientationSelect = document.getElementById("modOrientation");
const modMarginCmInput = document.getElementById("modMarginCm");
const modOpacityInput = document.getElementById("modOpacity");
const drawModulesBtn = document.getElementById("drawModulesBtn");
const clearModulesBtn = document.getElementById("clearModulesBtn");

let points = [];
let imgLoaded = false;
let polygonClosed = false;
let modules = [];
let moduleIdCounter = 1;

// Dachhaut-Spezifikation (cm)
const TILE_TYPES = {
  einfalz: { width_cm: 21.5, height_cm: 33 },
  doppelfalz: { width_cm: 30, height_cm: 33 },
  jumbo: { width_cm: 25, height_cm: 36 },
};

// Modulmaße (cm)
const MODULE_WIDTH_CM = 113.4;
const MODULE_HEIGHT_CM = 176.5;
const GAP_CM = 2;

// aktuelle Referenz (wird in updateMeasurements gesetzt)
let currentTraufeCm = null;
let currentOrtgangCm = null;
let basis = null; // { p1, p2, p3, tVec, oVec }

// ---------------- Bild laden ----------------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    roofImage.src = reader.result;
    points = [];
    modules = [];
    polygonClosed = false;
    imgLoaded = true;
    resetPolygonBtn.disabled = false;
    clearModulesBtn.disabled = true;
    pointInfo.textContent = "";
    measureInfo.textContent = "";
    currentTraufeCm = null;
    currentOrtgangCm = null;
    basis = null;
    clearOverlay();
  };
  reader.readAsDataURL(file);
});

roofImage.addEventListener("load", () => {
  overlay.setAttribute("viewBox", `0 0 ${roofImage.naturalWidth} ${roofImage.naturalHeight}`);
});

// ---------------- Polygon setzen ----------------

// 1. Punkt = Traufe links unten
// 2. Punkt = Traufe rechts unten
// 3. Punkt = Ortgang oben rechts
imageWrapper.addEventListener("click", (e) => {
  // Klick auf Modul: nur Modul löschen, keine neuen Punkte
  const target = e.target;
  if (target && target.matches("[data-module-id]")) {
    return;
  }

  if (!imgLoaded || polygonClosed) return;

  const rect = roofImage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const scaleX = roofImage.naturalWidth / rect.width;
  const scaleY = roofImage.naturalHeight / rect.height;
  const imgX = x * scaleX;
  const imgY = y * scaleY;

  // Wenn schon mindestens 3 Punkte vorhanden sind:
  // Klick in die Nähe des ersten Punktes schließt das Polygon
  if (points.length >= 3) {
    const first = points[0];
    const distPxScreen = Math.hypot(x - (first.x / scaleX + rect.left - rect.left), y - (first.y / scaleY + rect.top - rect.top));
    const thresholdScreenPx = 15; // ca. 15 px Bildschirm-Abstand
    if (distPxScreen < thresholdScreenPx) {
      // Polygon schließen: ersten Punkt als letzten wiederverwenden
      points.push({ x: first.x, y: first.y });
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
  modules = [];
  polygonClosed = false;
  clearOverlay();
  pointInfo.textContent = "";
  measureInfo.textContent = "";
  clearModulesBtn.disabled = true;
  currentTraufeCm = null;
  currentOrtgangCm = null;
  basis = null;
});

// ---------------- Module zeichnen (perspektivisch) ----------------

drawModulesBtn.addEventListener("click", () => {
  if (!imgLoaded || points.length < 3 || !basis || currentTraufeCm == null || currentOrtgangCm == null) {
    alert("Bitte zuerst Bild, Punkte (mind. 3) und Referenz (Dachhaut & Ziegelanzahlen) setzen.");
    return;
  }

  const marginCm = Number(modMarginCmInput.value) || 0;
  if (marginCm < 0) {
    alert("Rand darf nicht negativ sein.");
    return;
  }

  const traufe_cm = currentTraufeCm;
  const ortgang_cm = currentOrtgangCm;

  let modWcm = MODULE_WIDTH_CM;
  let modHcm = MODULE_HEIGHT_CM;
  if (modOrientationSelect.value === "horizontal") {
    [modWcm, modHcm] = [modHcm, modWcm];
  }

  const cellWcm = modWcm + GAP_CM;
  const cellHcm = modHcm + GAP_CM;

  const usableTraufe = traufe_cm - 2 * marginCm;
  const usableOrtgang = ortgang_cm - 2 * marginCm;

  if (usableTraufe <= 0 || usableOrtgang <= 0) {
    alert("Rand ist größer als die Dachlänge. Bitte Rand verkleinern.");
    return;
  }

  const countX = Math.floor((usableTraufe + GAP_CM) / cellWcm);
  const countY = Math.floor((usableOrtgang + GAP_CM) / cellHcm);

  if (countX <= 0 || countY <= 0) {
    alert("Mit den aktuellen Maßen/Rand passen keine Module in die Fläche.");
    return;
  }

  // Hilfsfunktion: physikalische Koordinate (cm) -> Bildkoordinate
  const toRoofPoint = (uCm, vCm) => {
    const u = uCm / traufe_cm;   // 0..1 entlang Traufe (p1->p2)
    const v = vCm / ortgang_cm;  // 0..1 entlang Ortgang (p2->p3)
    const x = basis.p1.x + u * basis.tVec.x + v * basis.oVec.x;
    const y = basis.p1.y + u * basis.tVec.y + v * basis.oVec.y;
    return { x, y };
  };

  // Bisherige Module entfernen, Polygon bleibt
  const oldModules = Array.from(overlay.querySelectorAll("[data-module-id]"));
  oldModules.forEach((el) => el.remove());
  modules = [];

  const startU = marginCm;
  const startV = marginCm;

  for (let j = 0; j < countY; j++) {
    for (let i = 0; i < countX; i++) {
      const u0 = startU + i * cellWcm;
      const u1 = u0 + modWcm;
      const v0 = startV + j * cellHcm;
      const v1 = v0 + modHcm;

      const pBL = toRoofPoint(u0, v0); // bottom left
      const pBR = toRoofPoint(u1, v0); // bottom right
      const pTR = toRoofPoint(u1, v1); // top right
      const pTL = toRoofPoint(u0, v1); // top left

      const id = moduleIdCounter++;

      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const ptsStr = `${pBL.x},${pBL.y} ${pBR.x},${pBR.y} ${pTR.x},${pTR.y} ${pTL.x},${pTL.y}`;
      poly.setAttribute("points", ptsStr);
      poly.setAttribute("fill", "black");
      poly.setAttribute("fill-opacity", modOpacityInput.value);
      poly.setAttribute("stroke", "white");
      poly.setAttribute("stroke-width", "0.8");
      poly.dataset.moduleId = String(id);

      poly.addEventListener("click", (ev) => {
        ev.stopPropagation();
        poly.remove();
        modules = modules.filter((m) => m.id !== id);
        if (modules.length === 0) {
          clearModulesBtn.disabled = true;
        }
      });

      overlay.appendChild(poly);
      modules.push({ id, corners: [pBL, pBR, pTR, pTL] });
    }
  }

  clearModulesBtn.disabled = modules.length === 0;
});

clearModulesBtn.addEventListener("click", () => {
  const polys = Array.from(overlay.querySelectorAll("[data-module-id]"));
  polys.forEach((p) => p.remove());
  modules = [];
  clearModulesBtn.disabled = true;
});

// Transparenz live anpassen
modOpacityInput.addEventListener("input", () => {
  const polys = Array.from(overlay.querySelectorAll("[data-module-id]"));
  polys.forEach((p) => {
    p.setAttribute("fill-opacity", modOpacityInput.value);
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

  // Linien
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

  pointInfo.textContent = `Punkte: ${points.length}${polygonClosed ? " (geschlossen)" : ""}`;

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

// Messwerte (Längen, Fläche) berechnen und Referenzbasis setzen
function updateMeasurements() {
  measureInfo.textContent = "";

  const typeKey = roofTypeSelect.value;
  const nTraufe = Number(tilesTraufeInput.value);
  const nOrtgang = Number(tilesOrtgangInput.value);

  if (!typeKey || !nTraufe || !nOrtgang || points.length < 3) {
    currentTraufeCm = null;
    currentOrtgangCm = null;
    basis = null;
    return;
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

  // cm pro Pixel (separat für beide Richtungen)
  const cmPerPxTraufe = traufe_cm / pxTraufe;
  const cmPerPxOrtgang = ortgang_cm / pxOrtgang;

  // einfacher isotroper Mittelwert
  const cmPerPx = (cmPerPxTraufe + cmPerPxOrtgang) / 2;

  // Fläche in Pixeln → m²
  const areaPx = polygonAreaPx(points);
  const area_m2 = areaPx * (cmPerPx * cmPerPx) / 10000; // cm² -> m²

  const traufe_m = traufe_cm / 100;
  const ortgang_m = ortgang_cm / 100;

  measureInfo.textContent =
    `Traufe: ${traufe_m.toFixed(2)} m, Ortgang: ${ortgang_m.toFixed(2)} m, ` +
    `Fläche: ${area_m2.toFixed(2)} m²`;

  // Referenzbasis für perspektivische Module speichern
  const tVec = { x: p2.x - p1.x, y: p2.y - p1.y };
  const oVec = { x: p3.x - p2.x, y: p3.y - p2.y };

  basis = { p1, p2, p3, tVec, oVec };
  currentTraufeCm = traufe_cm;
  currentOrtgangCm = ortgang_cm;
}
