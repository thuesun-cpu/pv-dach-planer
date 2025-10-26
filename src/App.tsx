import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };
type PtM = { x: number; y: number };
type ModuleRect = { id: string; x: number; y: number; w: number; h: number; removed?: boolean }; // Meter-Koords

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton: { w_cm: 30, h_cm: 33, label: "Doppelfalzziegel / Beton 30×33 cm" },
  tonstein: { w_cm: 30, h_cm: 33, label: "Tonstein 30×33 cm" },
  jumbo: { w_cm: 34, h_cm: 36, label: "Jumboziegel 34×36 cm" },
} as const;

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
function pointInPolygonPx(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
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
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);

  // Polygon (px)
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Maßstab (m/px)
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });
  const [countOrtgang, setCountOrtgang] = useState<string>("");
  const [countTraufe,  setCountTraufe]  = useState<string>("");
  const [lenOrtgangM,  setLenOrtgangM]  = useState<string>("");
  const [lenTraufeM,   setLenTraufeM]   = useState<string>("");
  const [segOrtgang, setSegOrtgang] = useState<Pt[]>([]);
  const [segTraufe,  setSegTraufe]  = useState<Pt[]>([]);
  const [segFirst,   setSegFirst]   = useState<Pt[]>([]); // NEU: First

  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Module (Meter-Logik → Pixel-Zeichnung mit Perspektive)
  const [modules, setModules] = useState<ModuleRect[]>([]);
  const [moduleWmm, setModuleWmm] = useState<number>(1176);
  const [moduleHmm, setModuleHmm] = useState<number>(1134);
  const [orientation, setOrientation] = useState<"horizontal" | "vertikal">("horizontal");
  const [fillSolid, setFillSolid] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.6);

  // Modus
  const [setMode, setSetMode] = useState<"polygon" | "segOrtgang" | "segTraufe" | "segFirst" | "modules">("polygon");

  const imgRef = useRef<HTMLImageElement | null>(null);

  const relPos = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  // Klick ins Bild (je nach Modus)
  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = relPos(e);

    if (setMode === "modules") {
      // Hit-Test in px (vereinfachte Variante – mit Bounding Test)
      // Wir toggeln das Modul, dessen Schwerpunkt am nächsten ist:
      let bestIdx = -1, bestD = 999999;
      modules.forEach((m, i) => {
        if (m.removed) return;
        // Mittelpunkt in px (ohne Rotation; reicht für Toggle-Zweck)
        const centerPx = meterToPixel({ x: m.x + m.w / 2, y: m.y + m.h / 2 }, 0); // t egal
        const d = Math.hypot(centerPx.x - p.x, centerPx.y - p.y);
        if (d < bestD) { bestD = d; bestIdx = i; }
      });
      if (bestIdx >= 0 && bestD < 30) {
        const copy = [...modules];
        copy[bestIdx] = { ...copy[bestIdx], removed: true };
        setModules(copy);
      }
      return;
    }

    if (setMode === "segOrtgang") { setSegOrtgang(prev => (prev.length >= 2 ? [p] : [...prev, p])); return; }
    if (setMode === "segTraufe")  { setSegTraufe(prev  => (prev.length >= 2 ? [p] : [...prev, p]));  return; }
    if (setMode === "segFirst")   { setSegFirst(prev   => (prev.length >= 2 ? [p] : [...prev, p]));   return; }

    if (!closed) setPoints(prev => [...prev, p]); // Polygonpunkte
  };

  // Dragging der Polygonpunkte
  const startDrag = (i: number) => (e: React.MouseEvent) => { e.preventDefault(); setDragIndex(i); };
  const onMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const p = relPos(e);
    setPoints(prev => { const cp = [...prev]; cp[dragIndex] = p; return cp; });
  };
  const endDrag = () => setDragIndex(null);

  // Maßstab berechnen (m/px) – wie vorher
  const recomputeScale = () => {
    const mpps: number[] = [];
    if (segOrtgang.length === 2) {
      const px = distance(segOrtgang[0], segOrtgang[1]);
      if (px > 0) {
        if (cover.kind === "tile") {
          const spec = TILE_SPECS_CM[cover.variant as keyof typeof TILE_SPECS_CM];
          const count = parseFloat(countOrtgang.replace(",", "."));
          if (isFinite(count) && count > 0) mpps.push((count * spec.w_cm / 100) / px);
        } else {
          const m = parseFloat(lenOrtgangM.replace(",", "."));
          if (isFinite(m) && m > 0) mpps.push(m / px);
        }
      }
    }
    if (segTraufe.length === 2) {
      const px = distance(segTraufe[0], segTraufe[1]);
      if (px > 0) {
        if (cover.kind === "tile") {
          const spec = TILE_SPECS_CM[cover.variant as keyof typeof TILE_SPECS_CM];
          const count = parseFloat(countTraufe.replace(",", "."));
          if (isFinite(count) && count > 0) mpps.push((count * spec.h_cm / 100) / px);
        } else {
          const m = parseFloat(lenTraufeM.replace(",", "."));
          if (isFinite(m) && m > 0) mpps.push(m / px);
        }
      }
    }
    if (mpps.length === 0) setMetersPerPixel(null);
    else if (mpps.length === 1) setMetersPerPixel(mpps[0]);
    else setMetersPerPixel((mpps[0] + mpps[1]) / 2);
  };

  // --- Perspektive: Vektoren & Skala entlang Traufe→First ---
  const basePxPerM = metersPerPixel ? 1 / metersPerPixel : null;
  const trLenPx = segTraufe.length === 2 ? distance(segTraufe[0], segTraufe[1]) : null;
  const fiLenPx = segFirst.length  === 2 ? distance(segFirst[0], segFirst[1])   : null;

  // Richtung "parallel zum Ortgang"
  const uVec = (() => {
    if (segOrtgang.length !== 2) return { x: 1, y: 0 };
    const v = { x: segOrtgang[1].x - segOrtgang[0].x, y: segOrtgang[1].y - segOrtgang[0].y };
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  })();

  // Richtung von Traufe zur First (für Reihen-Versatz)
  const nVec = (() => {
    if (segTraufe.length !== 2 || segFirst.length !== 2) return { x: 0, y: -1 };
    const mt = { x: (segTraufe[0].x + segTraufe[1].x) / 2, y: (segTraufe[0].y + segTraufe[1].y) / 2 };
    const mf = { x: (segFirst[0].x + segFirst[1].x) / 2, y: (segFirst[0].y + segFirst[1].y) / 2 };
    const v = { x: mf.x - mt.x, y: mf.y - mt.y };
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  })();

  const MARGIN_M = 0.30; // 30 cm
  const GAP_M = 0.02;    // 2 cm

  // px-Koordinate eines Meterpunkts unter perspektivischer Schrumpfung
  function meterToPixel(pM: PtM, t01: number): Pt {
    // px/m skaliert entlang t (0 = Traufe, 1 = First)
    if (!basePxPerM || !trLenPx || !fiLenPx) return { x: 0, y: 0 };
    const scaleRow = lerp(1, fiLenPx / trLenPx, clamp01(t01)); // 1 → Verhältnis First/Traufe
    const pxPerM_row = basePxPerM * scaleRow;

    // Ursprung in Pixel: Mitte der Traufe + Versatz entlang nVec
    const mt = segTraufe.length === 2 ? { x: (segTraufe[0].x + segTraufe[1].x) / 2, y: (segTraufe[0].y + segTraufe[1].y) / 2 } : { x: 0, y: 0 };
    const mf = segFirst.length  === 2 ? { x: (segFirst[0].x  + segFirst[1].x)  / 2, y: (segFirst[0].y  + segFirst[1].y)  / 2 } : { x: 0, y: 0 };
    const mid = { x: lerp(mt.x, mf.x, t01), y: lerp(mt.y, mf.y, t01) }; // Mittellinie Traufe→First

    // Achsen in Pixeln: uVec (Ortgang-parallel) & nVec (Traufe→First)
    const ux = uVec.x * pxPerM_row, uy = uVec.y * pxPerM_row;
    const nx = nVec.x * pxPerM_row, ny = nVec.y * pxPerM_row;

    // Koord (pM.x, pM.y): x entlang Ortgang, y entlang Traufe (0 am Traufenrand)
    return { x: mid.x + pM.x * ux + pM.y * nx, y: mid.y + pM.x * uy + pM.y * ny };
  }

  // Module erzeugen (perspektivisch verjüngt)
  const placeModules = () => {
    if (!metersPerPixel) { alert("Bitte zuerst den Maßstab berechnen."); return; }
    if (!closed || points.length < 3) { alert("Bitte zuerst das Polygon schließen."); return; }
    if (segTraufe.length !== 2 || segFirst.length !== 2 || segOrtgang.length !== 2) {
      alert("Bitte Traufe, First und Ortgang als Segmente (je 2 Klicks) setzen.");
      return;
    }

    // reale Längen (m)
    let Lx_m: number | null = null; // entlang Ortgang
    let Ly_m: number | null = null; // Traufe→First
    if (cover.kind === "tile") {
      const spec = TILE_SPECS_CM[cover.variant as keyof typeof TILE_SPECS_CM];
      const cO = parseFloat(countOrtgang.replace(",", "."));
      const cT = parseFloat(countTraufe.replace(",", "."));
      if (isFinite(cO) && cO > 0) Lx_m = (cO * spec.w_cm) / 100;
      if (isFinite(cT) && cT > 0) Ly_m = (cT * spec.h_cm) / 100;
    } else {
      const lO = parseFloat(lenOrtgangM.replace(",", "."));
      const lT = parseFloat(lenTraufeM.replace(",", "."));
      if (isFinite(lO) && lO > 0) Lx_m = lO;
      if (isFinite(lT) && lT > 0) Ly_m = lT;
    }
    if (!Lx_m || !Ly_m) { alert("Bitte Ortgang-/Traufe-Maße/Anzahl vollständig angeben."); return; }

    // Modulmaß (m) + Ausrichtung
    const baseWm = moduleWmm / 1000;
    const baseHm = moduleHmm / 1000;
    const modW = orientation === "horizontal" ? baseWm : baseHm;
    const modH = orientation === "horizontal" ? baseHm : baseWm;

    const out: ModuleRect[] = [];
    // Raster in Meter-Koordinaten (0..Lx, 0..Ly), mit Rand und Fuge
    for (let y = MARGIN_M; y + modH <= Ly_m - MARGIN_M + 1e-9; y += modH + GAP_M) {
      const t = clamp01(y / Ly_m); // für Verjüngung (Traufe→First)
      for (let x = MARGIN_M; x + modW <= Lx_m - MARGIN_M + 1e-9; x += modW + GAP_M) {
        // Schwerpunkt des Moduls in Pixel (für Clip in Polygon + Rand 30 cm)
        const centerPx = meterToPixel({ x: x + modW / 2, y: y + modH / 2 }, t);
        // Abstand zu Polygonkanten in Pixel → mit 30cm umrechnen
        const mpp_here = (1 / (metersPerPixel || 1)); // px/m Basis
        const marginPx = 0.30 * mpp_here; // grob; t-Skalierung wirkt über meterToPixel
        if (!pointInPolygonPx(centerPx, points)) continue;
        if (minDistToEdgesPx(centerPx, points) < marginPx) continue;
        out.push({ id: `${out.length}`, x, y, w: modW, h: modH });
      }
    }
    setModules(out);
    setSetMode("modules");
  };

  const clearModules = () => setModules([]);

  const resetAll = () => {
    setPoints([]); setDragIndex(null); setClosed(false);
    setSegOrtgang([]); setSegTraufe([]); setSegFirst([]);
    setMetersPerPixel(null); setModules([]);
  };

  // Zeichnen
  return (
    <div>
      {/* Upload */}
      <input
        type="file" accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = () => { setImage(reader.result as string); resetAll(); };
          reader.readAsDataURL(file);
        }}
      />

      {/* Steuerleiste */}
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>Dachhaut:&nbsp;
            <select
              value={cover.kind === "tile" ? `tile:${cover.variant}` : `sheet:${cover.variant}`}
              onChange={(e) => {
                const [k, v] = e.target.value.split(":");
                if (k === "tile") setCover({ kind: "tile", variant: v as any });
                else setCover({ kind: "sheet", variant: v as any });
                setSegOrtgang([]); setSegTraufe([]); setSegFirst([]);
                setCountOrtgang(""); setCountTraufe(""); setLenOrtgangM(""); setLenTraufeM("");
                setMetersPerPixel(null); setModules([]);
              }}
            >
              <option value="tile:einfalz">{TILE_SPECS_CM.einfalz.label}</option>
              <option value="tile:doppelfalz_beton">{TILE_SPECS_CM.doppelfalz_beton.label}</option>
              <option value="tile:tonstein">{TILE_SPECS_CM.tonstein.label}</option>
              <option value="tile:jumbo">{TILE_SPECS_CM.jumbo.label}</option>
              <option value="sheet:bitumen">Bitumendach</option>
              <option value="sheet:wellblech">Wellblech (≥ 0,7 mm)</option>
              <option value="sheet:trapezblech">Trapezblech (≥ 0,7 mm)</option>
            </select>
          </label>
          <span><b>Aktiver Modus:</b> {
            setMode === "polygon" ? "Polygon setzen" :
            setMode === "segOrtgang" ? "Ortgang-Segment" :
            setMode === "segTraufe"  ? "Traufe-Segment"  :
            setMode === "segFirst"   ? "First-Segment"   : "Module bearbeiten"
          }</span>
        </div>

        {/* Referenzen */}
        {cover.kind === "tile" ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>Ziegel <b>Ortgang</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countOrtgang} onChange={(e)=>setCountOrtgang(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setSetMode("segOrtgang")}>Segment Ortgang (2 Klicks)</button>
              <span>{segOrtgang.length}/2 {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>Ziegel <b>Traufe</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countTraufe} onChange={(e)=>setCountTraufe(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setSetMode("segTraufe")}>Segment Traufe (2 Klicks)</button>
              <span>{segTraufe.length}/2 {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>Länge <b>Ortgang</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenOrtgangM} onChange={(e)=>setLenOrtgangM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setSetMode("segOrtgang")}>Segment Ortgang (2 Klicks)</button>
              <span>{segOrtgang.length}/2 {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>Länge <b>Traufe</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenTraufeM} onChange={(e)=>setLenTraufeM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setSetMode("segTraufe")}>Segment Traufe (2 Klicks)</button>
              <span>{segTraufe.length}/2 {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        )}

        {/* NEU: First */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setSetMode("segFirst")}>Segment <b>First</b> (2 Klicks)</button>
          <span>{segFirst.length}/2 {segFirst.length===2 && "✅"}</span>
          <button onClick={recomputeScale}>Maßstab berechnen</button>
          <button onClick={() => setSetMode("polygon")}>Polygon setzen</button>
          <button onClick={() => { setSegOrtgang([]); setSegTraufe([]); setSegFirst([]); setMetersPerPixel(null); }}>
            Referenzen löschen
          </button>
          <button onClick={() => setClosed(c=>!c)} disabled={points.length<3}>
            {closed ? "Polygon öffnen" : "Polygon schließen"}
          </button>
          <button onClick={() => setPoints(p=>p.slice(0,-1))} disabled={points.length===0 || closed}>
            Letzten Punkt löschen
          </button>
          <button onClick={() => { setPoints([]); setClosed(false); }} disabled={points.length===0}>
            Fläche zurücksetzen
          </button>
        </div>

        {/* Module */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Module (perspektivisch parallel zum Ortgang)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label>Breite (mm):
              <input type="number" value={moduleWmm} onChange={(e)=>setModuleWmm(parseInt(e.target.value||"0",10))} style={{ width: 100, marginLeft: 6 }} />
            </label>
            <label>Höhe (mm):
              <input type="number" value={moduleHmm} onChange={(e)=>setModuleHmm(parseInt(e.target.value||"0",10))} style={{ width: 100, marginLeft: 6 }} />
            </label>
            <label>Ausrichtung:
              <select value={orientation} onChange={(e)=>setOrientation(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="horizontal">horizontal</option>
                <option value="vertikal">vertikal</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={fillSolid} onChange={(e)=>setFillSolid(e.target.checked)} />
              deckend
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Transparenz
              <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e)=>setOpacity(parseFloat(e.target.value))} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={placeModules}>Module einzeichnen</button>
            <button onClick={()=>setModules([])} disabled={modules.length===0}>Module löschen</button>
            <button onClick={()=>setSetMode("modules")} disabled={modules.length===0}>Module bearbeiten (anklicken)</button>
          </div>
          {modules.length > 0 && (
            <div style={{ fontSize: 14 }}>
              Platziert: <b>{modules.filter(m=>!m.removed).length}</b> / {modules.length}
            </div>
          )}
        </div>

        {/* Anzeige Maßstab & Fläche */}
        <div>
          {metersPerPixel
            ? <b>Maßstab: {metersPerPixel.toFixed(5)} m/px {closed && points.length>=3 && <> • Fläche: {(polygonAreaPx2(points)*metersPerPixel*metersPerPixel).toFixed(2)} m²</>}</b>
            : <span>Maßstab noch nicht gesetzt – Referenzen + „Maßstab berechnen“.</span>}
        </div>
      </div>

      {/* Bild + Overlay */}
      {image && (
        <div
          style={{ marginTop: 12, position: "relative", display: "inline-block" }}
          onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        >
          <img
            ref={imgRef} src={image} alt="Dach"
            style={{ maxWidth: "100%", display: "block", cursor: "crosshair" }}
            onClick={onImgClick}
          />

          {/* Overlay: Klicks dürfen durch (pointerEvents:none); interaktive Punkte selber 'auto' */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {/* Referenz-Segmente */}
            {segOrtgang.map((p, i) => <circle key={`o-${i}`} cx={p.x} cy={p.y} r={5} fill="#0070f3" />)}
            {segOrtgang.length===2 && (
              <line x1={segOrtgang[0].x} y1={segOrtgang[0].y} x2={segOrtgang[1].x} y2={segOrtgang[1].y}
                    stroke="#0070f3" strokeWidth={2} strokeDasharray="6 4" />
            )}
            {segTraufe.map((p, i) => <circle key={`t-${i}`} cx={p.x} cy={p.y} r={5} fill="#00b894" />)}
            {segTraufe.length===2 && (
              <line x1={segTraufe[0].x} y1={segTraufe[0].y} x2={segTraufe[1].x} y2={segTraufe[1].y}
                    stroke="#00b894" strokeWidth={2} strokeDasharray="6 4" />
            )}
            {segFirst.map((p, i) => <circle key={`f-${i}`} cx={p.x} cy={p.y} r={5} fill="#8b5cf6" />)}
            {segFirst.length===2 && (
              <line x1={segFirst[0].x} y1={segFirst[0].y} x2={segFirst[1].x} y2={segFirst[1].y}
                    stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 4" />
            )}

            {/* Module: als Rechtecke in px mit perspektivischer Schrumpfung je Reihe */}
            {metersPerPixel && segTraufe.length===2 && segFirst.length===2 && modules.map(m => {
              if (m.removed) return null;
              const t = clamp01(m.y / (parseFloat(countTraufe || lenTraufeM || "0") > 0 ? (cover.kind==="tile"
                           ? (parseFloat(countTraufe.replace(",", ".")) * TILE_SPECS_CM[cover.variant as any].h_cm / 100)
                           : parseFloat(lenTraufeM.replace(",", "."))) : 1));
              // vier Ecken in Meter:
              const A = { x: m.x,         y: m.y         };
              const B = { x: m.x + m.w,   y: m.y         };
              const C = { x: m.x + m.w,   y: m.y + m.h   };
              const D = { x: m.x,         y: m.y + m.h   };
              // in Pixel (mit Schrumpf je Reihe)
              const Ap = meterToPixel(A, t);
              const Bp = meterToPixel(B, t);
              const Cp = meterToPixel(C, clamp01((m.y + m.h)/((cover.kind==="tile"
                           ? (parseFloat(countTraufe.replace(",", ".")) * TILE_SPECS_CM[cover.variant as any].h_cm / 100)
                           : parseFloat(lenTraufeM.replace(",", "."))) || 1)));
              const Dp = meterToPixel(D, t);
              return (
                <g key={m.id} opacity={fillSolid ? 1 : opacity}>
                  <polygon
                    points={`${Ap.x},${Ap.y} ${Bp.x},${Bp.y} ${Cp.x},${Cp.y} ${Dp.x},${Dp.y}`}
                    fill="#10b981" stroke="#065f46" strokeWidth={1}
                  />
                </g>
              );
            })}

            {/* Polygon offen/gefüllt */}
            {!closed && points.map((p, i) => {
              const n = points[i + 1]; return n ?
                <line key={`l-${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="red" strokeWidth={2} /> : null;
            })}
            {closed && points.length>=3 && (
              <polygon points={points.map(p=>`${p.x},${p.y}`).join(" ")}
                       fill="rgba(255,0,0,0.18)" stroke="red" strokeWidth={2} />
            )}

            {/* Ziehbare Polygonpunkte */}
            {points.map((p, i) => (
              <circle key={`p-${i}`} cx={p.x} cy={p.y} r={6}
                      fill={i===dragIndex ? "#d00" : "red"}
                      style={{ cursor: "grab", pointerEvents: "auto" }}
                      onMouseDown={(e)=>{ e.preventDefault(); setDragIndex(i); }} />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
