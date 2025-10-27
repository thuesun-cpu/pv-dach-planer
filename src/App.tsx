import React, { useRef, useState } from "react";

/** ---------- Typen ---------- */
type Pt = { x: number; y: number };          // Bildkoordinaten (px)
type ModuleUV = { id: string; u0: number; v0: number; u1: number; v1: number; removed?: boolean };

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "betonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz:           { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton:  { w_cm: 30,   h_cm: 33, label: "Doppelfalzziegel 30×33 cm" },
  betonstein:        { w_cm: 30,   h_cm: 33, label: "Betonstein 30×33 cm" },
  jumbo:             { w_cm: 34,   h_cm: 36, label: "Jumboziegel 34×36 cm" },
} as const;

/** ---------- Geometrie / Utils ---------- */
function distance(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y); }
function polygonAreaPx2(pts: Pt[]) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}
function pointInPolygon(px: number, py: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function distPointToSegPx(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A*C + B*D, lenSq = C*C + D*D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const xx = x1 + t*C, yy = y1 + t*D;
  return Math.hypot(px - xx, py - yy);
}
function minDistToEdgesPx(p: Pt, poly: Pt[]) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    m = Math.min(m, distPointToSegPx(p.x, p.y, a.x, a.y, b.x, b.y));
  }
  return m;
}

/** 8 Stützpunkte der Modulkontur: 4 Ecken + 4 Kantenmittelpunkte */
function sampleModuleEdgePoints(poly: Pt[]): Pt[] {
  const [tl, tr, br, bl] = poly;
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return [tl, tr, br, bl, mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl)];
}

/** ---------- Hauptkomponente ---------- */
export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);

  // Polygon (Dachfläche) in px  – wir beginnen an der Traufe!
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Kalibrierung – Pixellängen für Traufe/Ortgang kommen automatisch aus den 1.–3. Polygonpunkten
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });
  const [countOrtgang, setCountOrtgang] = useState<string>(""); // nur bei tile
  const [countTraufe,  setCountTraufe]  = useState<string>(""); // nur bei tile
  const [lenOrtgangM,  setLenOrtgangM]  = useState<string>(""); // nur bei sheet
  const [lenTraufeM,   setLenTraufeM]   = useState<string>(""); // nur bei sheet
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Modul-Parameter (Standard: vertikal 1134×1765 mm)
  const [moduleWmm, setModuleWmm] = useState<number>(1134);
  const [moduleHmm, setModuleHmm] = useState<number>(1765);
  const [orientation, setOrientation] = useState<"horizontal" | "vertikal">("vertikal");
  const [moduleStyle, setModuleStyle] = useState<"fullblack" | "vertex">("fullblack");
  const [opacity, setOpacity] = useState<number>(0.9);

  // Raster-Rahmen (projektiv) – TL, TR, BR, BL in px
  const [frame, setFrame] = useState<Pt[] | null>(null);
  const [frameDrag, setFrameDrag] = useState<{ type: "move" | "corner"; idx?: number } | null>(null);

  // Module als UV-Rechtecke (damit sie am Frame „kleben“)
  const [modulesUV, setModulesUV] = useState<ModuleUV[]>([]);

  // Modus
  const [mode, setMode] = useState<"polygon" | "frame" | "modules">("polygon");

  const imgRef = useRef<HTMLImageElement | null>(null);

  /** Position relativ zum Bild */
  const relPos = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  /** Klicks */
  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (mode !== "polygon" || closed) return;
    const p = relPos(e);
    setPoints(prev => [...prev, p]);
  };

  /** Mouse-Move (Drag) */
  const onMouseMoveOverlay = (e: React.MouseEvent) => {
    if (dragIndex !== null && mode === "polygon") {
      const p = relPos(e);
      setPoints(prev => { const cp = [...prev]; cp[dragIndex] = p; return cp; });
    }
    if (frame && frameDrag && mode === "frame") {
      if (frameDrag.type === "corner" && frameDrag.idx !== undefined) {
        const p = relPos(e);
        setFrame(prev => {
          if (!prev) return prev;
          const cp = [...prev]; cp[frameDrag.idx!] = p; return cp;
        });
      } else if (frameDrag.type === "move") {
        const dx = (e as any).movementX ?? 0;
        const dy = (e as any).movementY ?? 0;
        setFrame(prev => prev?.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) ?? prev);
      }
    }
  };
  const onMouseUpOverlay = () => { setDragIndex(null); setFrameDrag(null); };

  /** Traufe- und Ortgang-Länge in Pixeln aus den ersten 3 Polygonpunkten */
  const traufePx = () => (points.length >= 2 ? distance(points[0], points[1]) : null);
  const ortgangPx = () => (points.length >= 3 ? distance(points[1], points[2]) : null);

  /** Maßstab berechnen – nutzt automatisch Traufe/Ortgang aus dem Polygon */
  const recomputeScale = () => {
    const mpps: number[] = [];
    const pxTraufe = traufePx();
    const pxOrtgang = ortgangPx();

    if (pxOrtgang && pxOrtgang > 0) {
      if (cover.kind === "tile") {
        const spec = TILE_SPECS_CM[(cover.variant as keyof typeof TILE_SPECS_CM)];
        const c = parseFloat(countOrtgang.replace(",", "."));
        if (isFinite(c) && c > 0) mpps.push((c * spec.w_cm / 100) / pxOrtgang);
      } else {
        const m = parseFloat(lenOrtgangM.replace(",", "."));
        if (isFinite(m) && m > 0) mpps.push(m / pxOrtgang);
      }
    }

    if (pxTraufe && pxTraufe > 0) {
      if (cover.kind === "tile") {
        const spec = TILE_SPECS_CM[(cover.variant as keyof typeof TILE_SPECS_CM)];
        const c = parseFloat(countTraufe.replace(",", "."));
        if (isFinite(c) && c > 0) mpps.push((c * spec.h_cm / 100) / pxTraufe);
      } else {
        const m = parseFloat(lenTraufeM.replace(",", "."));
        if (isFinite(m) && m > 0) mpps.push(m / pxTraufe);
      }
    }

    if (mpps.length === 0) {
      alert("Bitte: Polygon mit mind. 3 Punkten setzen (Traufe→Traufe→Ortgang) und Referenzwerte eingeben.");
      setMetersPerPixel(null);
    } else if (mpps.length === 1) {
      setMetersPerPixel(mpps[0]);
    } else {
      setMetersPerPixel((mpps[0] + mpps[1]) / 2);
    }
  };

  /** Fläche (m²) */
  const areaM2 =
    closed && points.length >= 3 && metersPerPixel
      ? polygonAreaPx2(points) * metersPerPixel * metersPerPixel
      : null;

  /** Raster-Rahmen initialisieren (aus Bounding-Box des Polygons) */
  const initFrameFromPolygon = () => {
    if (!metersPerPixel || points.length < 3) { alert("Bitte zuerst Maßstab setzen und Polygon schließen."); return; }
    if (!closed) { alert("Bitte zuerst das Polygon schließen."); return; }
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const f: Pt[] = [
      { x: minX, y: minY }, // TL
      { x: maxX, y: minY }, // TR
      { x: maxX, y: maxY }, // BR
      { x: minX, y: maxY }, // BL
    ];
    setFrame(f);
    setMode("frame");
    setModulesUV([]); // alte Module verwerfen
  };

  /** Bilinear (nahezu perspektivisch) */
  const mapUVtoPx = (u: number, v: number, fr: Pt[]) => {
    const [tl, tr, br, bl] = fr;
    const x = (1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x;
    const y = (1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y;
    return { x, y };
  };

  /** UV-Rechteck zu Pixel-Polygon (4 Punkte) */
  const uvRectToPolyPx = (m: ModuleUV, fr: Pt[]) => {
    const pTL = mapUVtoPx(m.u0, m.v0, fr);
    const pTR = mapUVtoPx(m.u1, m.v0, fr);
    const pBR = mapUVtoPx(m.u1, m.v1, fr);
    const pBL = mapUVtoPx(m.u0, m.v1, fr);
    return [pTL, pTR, pBR, pBL];
  };

  /** Module erzeugen (UV), mit 30 cm Mindestabstand der Außenkante */
  const placeModulesPerspective = () => {
    if (!frame || !metersPerPixel) { alert("Bitte zuerst Frame initialisieren und Maßstab setzen."); return; }
    if (!closed || points.length < 3) { alert("Bitte zuerst das Polygon schließen."); return; }

    // reale Rahmenlängen (m) entlang oben/links
    const topM   = distance(frame[0], frame[1]) * metersPerPixel; // TL->TR
    const leftM  = distance(frame[0], frame[3]) * metersPerPixel; // TL->BL

    // Modulmaß + 2cm Fuge – korrekt gemappt nach Orientation
    const Wm = (moduleWmm / 1000);
    const Hm = (moduleHmm / 1000);
    const gap = 0.02; // 2 cm
    const modW = orientation === "vertikal"   ? Wm : Hm; // vertikal: Breite=W, horizontal: Breite=H
    const modH = orientation === "vertikal"   ? Hm : Wm; // vertikal: Höhe=H,  horizontal: Höhe=W

    const out: ModuleUV[] = [];
    let id = 0;

    // Start ohne künstliche Innenränder; 30cm-Sicherheitsabstand prüft Außenkante
    for (let yM = 0; yM + modH <= leftM + 1e-9; yM += (modH + gap)) {
      for (let xM = 0; xM + modW <= topM + 1e-9; xM += (modW + gap)) {
        const u0 = xM / topM, v0 = yM / leftM;
        const u1 = (xM + modW) / topM, v1 = (yM + modH) / leftM;

        // Modulkontur im Bild (px)
        const poly = [
          mapUVtoPx(u0, v0, frame), // TL
          mapUVtoPx(u1, v0, frame), // TR
          mapUVtoPx(u1, v1, frame), // BR
          mapUVtoPx(u0, v1, frame), // BL
        ];

        // 1) Alle Stützpunkte innerhalb der Dachfläche
        const samples = sampleModuleEdgePoints(poly);
        let allInside = true;
        for (const s of samples) { if (!pointInPolygon(s.x, s.y, points)) { allInside = false; break; } }
        if (!allInside) continue;

        // 2) Abstand der Außenkante ≥ 0,30 m zu Dachkante
        const SAFETY = 0.30;
        let ok = true;
        for (const s of samples) {
          const dPx = minDistToEdgesPx(s, points);
          const dM  = dPx * metersPerPixel;
          if (dM < SAFETY) { ok = false; break; }
        }
        if (!ok) continue;

        out.push({ id: String(id++), u0, v0, u1, v1 });
      }
    }

    setModulesUV(out);
    setMode("modules");
  };

  /** Toggle via Klick direkt auf ein Modul (fix für Pointer-Events) */
  const onToggleModule = (id: string) => {
    setModulesUV(prev => {
      const cp = [...prev];
      const idx = cp.findIndex(m => m.id === id);
      if (idx >= 0) cp[idx] = { ...cp[idx], removed: !cp[idx].removed };
      return cp;
    });
  };

  /** Reset */
  const clearModules = () => setModulesUV([]);
  const resetAll = () => {
    setPoints([]); setDragIndex(null); setClosed(false);
    setMetersPerPixel(null);
    setModulesUV([]); setFrame(null); setFrameDrag(null);
  };

  /** Render-Hilfen */
  const pxPerM = metersPerPixel ? (1 / metersPerPixel) : 0;

  return (
    <div>
      {/* Upload */}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => { setImage(reader.result as string); resetAll(); };
          reader.readAsDataURL(file);
        }}
      />

      {/* Steuerleiste */}
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Dachhaut:&nbsp;
            <select
              value={cover.kind === "tile" ? `tile:${cover.variant}` : `sheet:${cover.variant}`}
              onChange={(e) => {
                const [k, v] = e.target.value.split(":");
                if (k === "tile") {
                  // Tonstein entfernt; Betonstein vorhanden
                  const valid = (["einfalz","doppelfalz_beton","betonstein","jumbo"] as const);
                  const vv = valid.includes(v as any) ? (v as any) : "einfalz";
                  setCover({ kind: "tile", variant: vv });
                } else {
                  setCover({ kind: "sheet", variant: v as any });
                }
                setMetersPerPixel(null);
              }}
            >
              <option value="tile:einfalz">{TILE_SPECS_CM.einfalz.label}</option>
              <option value="tile:doppelfalz_beton">{TILE_SPECS_CM.doppelfalz_beton.label}</option>
              <option value="tile:betonstein">{TILE_SPECS_CM.betonstein.label}</option>
              <option value="tile:jumbo">{TILE_SPECS_CM.jumbo.label}</option>
              <option value="sheet:bitumen">Bitumendach</option>
              <option value="sheet:wellblech">Wellblech (≥ 0,7 mm)</option>
              <option value="sheet:trapezblech">Trapezblech (≥ 0,7 mm)</option>
            </select>
          </label>

          <span><b>Modus:</b> {
            mode === "polygon" ? "Polygon setzen (Traufe→Traufe→Ortgang…)" :
            mode === "frame"   ? "Raster-Rahmen bearbeiten" :
                                 "Module bearbeiten"
          }</span>
        </div>

        {/* Referenzen (Maßstab) */}
        {cover.kind === "tile" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label> Ziegel <b>Ortgang</b> (Anzahl):
              <input type="number" min={1} value={countOrtgang} onChange={(e)=>setCountOrtgang(e.target.value)} style={{ width: 100, marginLeft: 6 }} />
            </label>
            <label> Ziegel <b>Traufe</b> (Anzahl):
              <input type="number" min={1} value={countTraufe} onChange={(e)=>setCountTraufe(e.target.value)} style={{ width: 100, marginLeft: 6 }} />
            </label>
            <button onClick={recomputeScale}>Maßstab berechnen</button>
            <span style={{ opacity: .7 }}>
              {points.length>=3
                ? "Kante1 (P1→P2)=Traufe, Kante2 (P2→P3)=Ortgang – automatisch erkannt."
                : "Polygon: mind. 3 Punkte setzen (Traufe→Traufe→Ortgang)."}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label> Länge <b>Ortgang</b> (m):
              <input type="number" step="0.01" value={lenOrtgangM} onChange={(e)=>setLenOrtgangM(e.target.value)} style={{ width: 120, marginLeft: 6 }} />
            </label>
            <label> Länge <b>Traufe</b> (m):
              <input type="number" step="0.01" value={lenTraufeM} onChange={(e)=>setLenTraufeM(e.target.value)} style={{ width: 120, marginLeft: 6 }} />
            </label>
            <button onClick={recomputeScale}>Maßstab berechnen</button>
            <span style={{ opacity: .7 }}>
              {points.length>=3
                ? "Kante1 (P1→P2)=Traufe, Kante2 (P2→P3)=Ortgang – automatisch erkannt."
                : "Polygon: mind. 3 Punkte setzen (Traufe→Traufe→Ortgang)."}
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setMode("polygon")}>Polygon setzen</button>
          <button onClick={() => setClosed(c=>!c)} disabled={points.length<3}>
            {closed ? "Polygon öffnen" : "Polygon schließen"}
          </button>
          <button onClick={() => setPoints(p=>p.slice(0,-1))} disabled={points.length===0 || closed}>
            Letzten Punkt löschen
          </button>
          <button onClick={() => { setPoints([]); setClosed(false); }}>Fläche zurücksetzen</button>
        </div>

        {/* Raster-Rahmen & Module */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Modulraster (perspektivisch)</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label>Breite (mm):
              <input type="number" value={moduleWmm} onChange={(e)=>setModuleWmm(parseInt(e.target.value||"0",10))} style={{ width: 100, marginLeft: 6 }} />
            </label>
            <label>Höhe (mm):
              <input type="number" value={moduleHmm} onChange={(e)=>setModuleHmm(parseInt(e.target.value||"0",10))} style={{ width: 100, marginLeft: 6 }} />
            </label>
            <label>Ausrichtung:
              <select value={orientation} onChange={(e)=>setOrientation(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="vertikal">vertikal</option>
                <option value="horizontal">horizontal</option>
              </select>
            </label>
            <label>Stil:
              <select value={moduleStyle} onChange={(e)=>setModuleStyle(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="fullblack">Full-Black</option>
                <option value="vertex">Vertex (Kontur + Diamant)</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Transparenz
              <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e)=>setOpacity(parseFloat(e.target.value))} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={initFrameFromPolygon}>Raster-Rahmen initialisieren</button>
            <button onClick={()=>setMode("frame")} disabled={!frame}>Rahmen bearbeiten</button>
            <button onClick={placeModulesPerspective} disabled={!frame}>Module einzeichnen</button>
            <button onClick={()=>setMode("modules")} disabled={modulesUV.length===0}>Module bearbeiten</button>
            <button onClick={clearModules} disabled={modulesUV.length===0}>Module löschen</button>
          </div>

          {metersPerPixel
            ? <b>Maßstab: {metersPerPixel.toFixed(5)} m/px {closed && points.length>=3 && <> • Fläche: {(polygonAreaPx2(points)*metersPerPixel*metersPerPixel).toFixed(2)} m²</>}</b>
            : <span>Maßstab noch nicht gesetzt – Referenzen eingeben und „Maßstab berechnen“.</span>}
        </div>
      </div>

      {/* Bild + Overlay */}
      {image && (
        <div
          style={{ marginTop: 12, position: "relative", display: "inline-block" }}
          onMouseMove={onMouseMoveOverlay} onMouseUp={onMouseUpOverlay} onMouseLeave={onMouseUpOverlay}
        >
          <img
            ref={imgRef} src={image} alt="Dach"
            style={{ maxWidth: "100%", display: "block", cursor: mode==="modules" ? "default" : "crosshair" }}
            onClick={onImgClick}
          />

          {/* SVG-Overlay:
              - Root: pointerEvents: 'none'
              - Interaktive Elemente (je nach Modus) bekommen 'pointerEvents: auto'
           */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <defs>
              {/* Full-Black Optik */}
              <pattern id="mod-fullblack" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="100" height="100" fill="#0b0b0b" />
                <path d="M0 50 H100 M50 0 V100" stroke="#111" strokeWidth="2"/>
                <rect x="0" y="0" width="100" height="100" fill="none" stroke="#161616" strokeWidth="4" />
              </pattern>
            </defs>

            {/* Module – interaktiv NUR im Mode 'modules' */}
            {frame && modulesUV.map(m => {
              if (m.removed) return null;
              const poly = uvRectToPolyPx(m, frame);
              const pts = poly.map(p => `${p.x},${p.y}`).join(" ");

              if (moduleStyle === "fullblack") {
                return (
                  <polygon
                    key={m.id}
                    points={pts}
                    fill="url(#mod-fullblack)"
                    opacity={opacity}
                    stroke="#111"
                    strokeWidth={0.6}
                    style={{ pointerEvents: mode==="modules" ? "auto" : "none", cursor: mode==="modules" ? "pointer" : "default" }}
                    onMouseDown={() => onToggleModule(m.id)}
                  />
                );
              } else {
                // Vertex: Kontur + Diamant
                const cx = (poly[0].x + poly[2].x) / 2;
                const cy = (poly[0].y + poly[2].y) / 2;
                const d = Math.max(6, 0.02 * pxPerM);
                return (
                  <g
                    key={m.id}
                    opacity={opacity}
                    style={{ pointerEvents: mode==="modules" ? "auto" : "none", cursor: mode==="modules" ? "pointer" : "default" }}
                    onMouseDown={() => onToggleModule(m.id)}
                  >
                    <polygon points={pts} fill="none" stroke="#0e7490" strokeWidth={1.2} />
                    <polygon
                      points={`${cx},${cy-d} ${cx+d},${cy} ${cx},${cy+d} ${cx-d},${cy}`}
                      fill="#0ea5b7" stroke="#0b7285" strokeWidth={0.8}
                    />
                  </g>
                );
              }
            })}

            {/* Polygon (Dachfläche) */}
            {!closed && points.map((p, i) => {
              const n = points[i+1]; return n
                ? <line key={`l-${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="red" strokeWidth={2} />
                : null;
            })}
            {closed && points.length>=3 && (
              <polygon points={points.map(p=>`${p.x},${p.y}`).join(" ")}
                       fill="rgba(255,0,0,0.15)" stroke="red" strokeWidth={2} />
            )}

            {/* Ziehbare Polygon-Punkte NUR im Mode 'polygon' */}
            {points.map((p, i) => (
              <circle key={`p-${i}`} cx={p.x} cy={p.y} r={6}
                      fill={i===dragIndex ? "#d00" : "red"}
                      style={{ cursor: mode==="polygon" ? "grab" : "default", pointerEvents: mode==="polygon" ? "auto" : "none" }}
                      onMouseDown={(e)=>{ if (mode!=="polygon") return; e.preventDefault(); setDragIndex(i); }} />
            ))}

            {/* Rahmen mit ziehbaren Ecken + Move – NUR im Mode 'frame' */}
            {frame && (
              <>
                {[0,1,2,3].map(i=>{
                  const a = frame[i], b = frame[(i+1)%4];
                  return <line key={`f-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                               stroke="#ffbf00" strokeWidth={2} strokeDasharray="6 4" />;
                })}
                {frame.map((p, i)=>(
                  <rect key={`fc-${i}`} x={p.x-6} y={p.y-6} width={12} height={12}
                        fill="#ffbf00" stroke="#7c5a00" strokeWidth={1}
                        style={{ pointerEvents: mode==="frame" ? "auto" : "none", cursor: "grab" }}
                        onMouseDown={(e)=>{ if (mode!=="frame") return; e.preventDefault(); setFrameDrag({type:"corner", idx:i}); }} />
                ))}
                <polygon
                  points={frame.map(p=>`${p.x},${p.y}`).join(" ")}
                  fill="transparent"
                  style={{ pointerEvents: mode==="frame" ? "auto" : "none", cursor: "move" }}
                  onMouseDown={(e)=>{ if (mode!=="frame") return; e.preventDefault(); setFrameDrag({type:"move"}); }}
                />
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
