// [gleiche Initialisierung wie zuvor ... bleibt unverändert]

function updateMeasurements() {
  const traufeCount = parseInt(document.getElementById("traufe")?.value);
  const ortgangCount = parseInt(document.getElementById("ortgang")?.value);
  const tileType = document.getElementById("tileSelect")?.value;

  let tileW = 0;
  let tileH = 0;

  switch (tileType) {
    case "einfalz":
      tileW = 0.215;
      tileH = 0.33;
      break;
    case "einfalzJumbo":
      tileW = 0.24; // 👈 geändert von 0.25 auf 0.24
      tileH = 0.40;
      break;
    case "doppelfalz":
      tileW = 0.30;
      tileH = 0.33;
      break;
    case "doppelfalzJumbo":
      tileW = 0.30;
      tileH = 0.40;
      break;
  }

  traufeM = traufeCount * tileW;
  ortgangM = ortgangCount * tileH;

  const pxArea = polygonArea(polygon);
  const pxTraufe = distance(polygon[0], polygon[1]);
  const pxOrtgang = distance(polygon[0], polygon[3]);

  const scale = ((traufeM / pxTraufe) + (ortgangM / pxOrtgang)) / 2;
  areaM2 = pxArea * scale * scale;

  document.getElementById("info").textContent =
    `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${areaM2.toFixed(2)} m²`;

  // ➕ Generatorfläche automatisch erstellen
  createGeneratorQuad(scale);
}

// ------------------- Generatorfläche berechnen + Module vorbereiten -------------------

function createGeneratorQuad(scale) {
  if (!polygonClosed || polygon.length < 4) return;

  // Traufe = Punkt 0–1, Ortgang = Punkt 0–3
  const p0 = polygon[0];
  const p1 = polygon[1];
  const p3 = polygon[3];

  const pxPerM_Traufe = distance(p0, p1) / traufeM;
  const pxPerM_Ortgang = distance(p0, p3) / ortgangM;

  const marginX = MARGIN * pxPerM_Traufe;
  const marginY = MARGIN * pxPerM_Ortgang;

  const q0 = {
    x: p0.x + marginX,
    y: p3.y + marginY
  };
  const q1 = {
    x: p1.x - marginX,
    y: p1.y + marginY
  };
  const q2 = {
    x: p1.x - marginX,
    y: p1.y + (ortgangM * pxPerM_Ortgang) - marginY
  };
  const q3 = {
    x: p0.x + marginX,
    y: p3.y + (ortgangM * pxPerM_Ortgang) - marginY
  };

  generatorQuad = [q0, q1, q2, q3];

  computeModuleGrid(generatorQuad, pxPerM_Traufe, pxPerM_Ortgang);
}

// ------------------- Modulraster berechnen -------------------

function computeModuleGrid(quad, pxPerM_Traufe, pxPerM_Ortgang) {
  const usableW = traufeM - 2 * MARGIN;
  const usableH = ortgangM - 2 * MARGIN;

  const moduleW = MODULE_W + MODULE_GAP;
  const moduleH = MODULE_H + MODULE_GAP;

  moduleCols = Math.floor(usableW / moduleW);
  moduleRows = Math.floor(usableH / moduleH);
}

// ------------------- Module zeichnen -------------------

function drawModules() {
  if (!generatorQuad || moduleCols <= 0 || moduleRows <= 0) return;

  const alpha = moduleOpacity;

  const q0 = generatorQuad[0];
  const q1 = generatorQuad[1];
  const q2 = generatorQuad[2];
  const q3 = generatorQuad[3];

  ctx.save();
  ctx.globalAlpha = alpha;

  for (let r = 0; r < moduleRows; r++) {
    const v0 = lerp(q0, q3, r / moduleRows);
    const v1 = lerp(q1, q2, r / moduleRows);
    const v0n = lerp(q0, q3, (r + 1) / moduleRows);
    const v1n = lerp(q1, q2, (r + 1) / moduleRows);

    for (let c = 0; c < moduleCols; c++) {
      const m0 = lerp(v0, v1, c / moduleCols);
      const m1 = lerp(v0, v1, (c + 1) / moduleCols);
      const m2 = lerp(v0n, v1n, (c + 1) / moduleCols);
      const m3 = lerp(v0n, v1n, c / moduleCols);

      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.lineTo(m2.x, m2.y);
      ctx.lineTo(m3.x, m3.y);
      ctx.closePath();

      ctx.fillStyle = "black";
      ctx.fill();

      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}
