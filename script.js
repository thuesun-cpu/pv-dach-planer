<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>PV-Dach-Planer</title>
  <style>
    body {
      font-family: Arial, sans-serif;
    }
    canvas {
      border: 1px solid #ccc;
      margin-top: 10px;
      display: block;
    }
    label {
      margin-right: 10px;
    }
  </style>
</head>
<body>
  <h2>PV-Dach-Planer</h2>
  
  <label>Dachbild: <input type="file" id="fileInput"></label>
  <label>Dachtyp: 
    <select id="roofType">
      <option value="satteldach">Satteldach</option>
      <option value="walmdach">Walmdach</option>
      <option value="zeltdach">Zeltdach</option>
    </select>
  </label>
  <label>Ziegeltyp: 
    <select id="tileType">
      <option value="einfalz">Einfalz (21 × 33 cm)</option>
      <option value="einfalzJumbo" selected>Einfalz Jumbo (23 × 40 cm)</option>
      <option value="doppelfalz">Doppelfalz (30 × 33 cm)</option>
      <option value="doppelfalzJumbo">Doppelfalz Jumbo (30 × 40 cm)</option>
    </select>
  </label>
  <label>Ziegel (Traufe): <input type="number" id="tilesTraufe" value="48" size="4"></label>
  <label>Ziegel (Ortgang): <input type="number" id="tilesOrtgang" value="15" size="4"></label>
  <br><br>
  <button id="drawGeneratorBtn">Generatorfläche anzeigen</button>
  <button id="clearGeneratorBtn">Zurücksetzen</button>
  <label>Modul-Transparenz: <input type="range" id="moduleOpacity" min="0" max="1" step="0.05" value="0.7"></label>

  <p id="info">Traufe: –, Ortgang: –, Fläche: –</p>

  <canvas id="canvas" width="1000" height="600"></canvas>

  <script>
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const fileInput = document.getElementById("fileInput");
    const tileType = document.getElementById("tileType");
    const roofType = document.getElementById("roofType");
    const tilesTraufeInput = document.getElementById("tilesTraufe");
    const tilesOrtgangInput = document.getElementById("tilesOrtgang");
    const drawGeneratorBtn = document.getElementById("drawGeneratorBtn");
    const clearGeneratorBtn = document.getElementById("clearGeneratorBtn");
    const moduleOpacityInput = document.getElementById("moduleOpacity");
    const info = document.getElementById("info");

    const image = new Image();
    let imageLoaded = false;

    let generatorQuad = null;
    let draggingIndex = -1;
    let fixedModuleCols = 0;
    let fixedModuleRows = 0;
    let scaleMtoPx = 1;

    const MODULE_W = 1.134;
    const MODULE_H = 1.765;
    const GAP = 0.02;
    const MARGIN = 0.3;
    const HANDLE_RADIUS = 6;

    fileInput.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        image.onload = () => {
          imageLoaded = true;
          canvas.width = image.width;
          canvas.height = image.height;
          generatorQuad = null;
          draw();
        };
        image.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    canvas.addEventListener("mousedown", e => {
      const pos = getMousePos(e);
      if (generatorQuad) {
        const idx = generatorQuad.findIndex(p =>
          Math.hypot(p.x - pos.x, p.y - pos.y) < HANDLE_RADIUS + 3
        );
        if (idx >= 0) {
          draggingIndex = idx;
        }
      }
    });

    canvas.addEventListener("mousemove", e => {
      if (draggingIndex < 0) return;
      const pos = getMousePos(e);
      generatorQuad[draggingIndex] = pos;
      draw();
    });

    canvas.addEventListener("mouseup", () => draggingIndex = -1);

    function getMousePos(evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (imageLoaded) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (generatorQuad) {
        ctx.beginPath();
        ctx.moveTo(generatorQuad[0].x, generatorQuad[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(generatorQuad[i].x, generatorQuad[i].y);
        ctx.closePath();
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "rgba(0,255,0,0.1)";
        ctx.fill();
        generatorQuad.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, 2 * Math.PI);
          ctx.fillStyle = "white";
          ctx.fill();
        });
        drawModules();
      }
    }

    function getTileSize() {
      switch (tileType.value) {
        case "einfalz": return { traufe: 0.21, ortgang: 0.33 };
        case "einfalzJumbo": return { traufe: 0.23, ortgang: 0.40 };
        case "doppelfalz": return { traufe: 0.30, ortgang: 0.33 };
        case "doppelfalzJumbo": return { traufe: 0.30, ortgang: 0.40 };
        default: return null;
      }
    }

    function computeGeneratorQuad() {
      const t = parseInt(tilesTraufeInput.value);
      const o = parseInt(tilesOrtgangInput.value);
      const tile = getTileSize();
      if (!tile || !t || !o) {
        info.textContent = "Traufe: –, Ortgang: –, Fläche: –";
        return;
      }

      const traufeM = tile.traufe * t;
      const ortgangM = tile.ortgang * o;
      const area = traufeM * ortgangM;
      info.textContent = `Traufe: ${traufeM.toFixed(2)} m, Ortgang: ${ortgangM.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;

      const scale = canvas.width / (traufeM + 0.6); // grobe Schätzung
      scaleMtoPx = scale;

      const wPx = traufeM * scale;
      const hPx = ortgangM * scale;
      const marginPx = MARGIN * scale;

      const x0 = marginPx;
      const y0 = canvas.height - marginPx - hPx;
      const x1 = x0 + wPx;
      const y1 = y0 + hPx;

      generatorQuad = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 }
      ];

      const usableW = traufeM - 2 * MARGIN;
      const usableH = ortgangM - 2 * MARGIN;
      fixedModuleCols = Math.floor((usableW + GAP) / (MODULE_W + GAP));
      fixedModuleRows = Math.floor((usableH + GAP) / (MODULE_H + GAP));
    }

    function drawModules() {
      if (!generatorQuad || fixedModuleCols <= 0 || fixedModuleRows <= 0) return;

      const [q0, q1, q2, q3] = generatorQuad;
      const opacity = parseFloat(moduleOpacityInput.value);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = "white";
      ctx.fillStyle = "black";

      const cols = fixedModuleCols;
      const rows = fixedModuleRows;

      const sStep = 1 / cols;
      const tStep = 1 / rows;

      for (let r = 0; r < rows; r++) {
        const t0 = r * tStep;
        const t1 = (r + 1) * tStep;

        const left0 = lerp(q0, q3, t0);
        const right0 = lerp(q1, q2, t0);
        const left1 = lerp(q0, q3, t1);
        const right1 = lerp(q1, q2, t1);

        for (let c = 0; c < cols; c++) {
          const s0 = c * sStep;
          const s1 = (c + 1) * sStep;

          const a = lerp(left0, right0, s0);
          const b = lerp(left0, right0, s1);
          const c1 = lerp(left1, right1, s1);
          const d = lerp(left1, right1, s0);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c1.x, c1.y);
          ctx.lineTo(d.x, d.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    function lerp(p1, p2, t) {
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
      };
    }

    drawGeneratorBtn.addEventListener("click", () => {
      computeGeneratorQuad();
      draw();
    });

    clearGeneratorBtn.addEventListener("click", () => {
      generatorQuad = null;
      fixedModuleCols = 0;
      fixedModuleRows = 0;
      draw();
    });

    tileType.addEventListener("change", computeGeneratorQuad);
    tilesTraufeInput.addEventListener("input", computeGeneratorQuad);
    tilesOrtgangInput.addEventListener("input", computeGeneratorQuad);
    moduleOpacityInput.addEventListener("input", draw);
  </script>
</body>
</html>
