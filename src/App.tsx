import React, { useRef, useState } from "react";

/** ---------- Typen ---------- */
type Pt = { x: number; y: number };          // Bildkoordinaten (px)
type PtM = { x: number; y: number };         // Meter-Koordinaten
type ModulePoly = { id: string; polyPx: Pt[]; removed?: boolean }; // gerendertes Modul als Polygon (px)

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton: { w_cm: 30,  h_cm: 33, label: "Doppelfalzziegel / Beton 30×33 cm" },
  tonstein:         { w_cm: 30,  h_cm: 33, label: "Tonstein 30×33 cm" },
  jumbo:            { w_cm: 34,  h_cm: 36, label: "Jumboziegel 34×36 cm" },
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

/** ---------- Hauptkomponente ---------- */
export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);

  // Polygon (Dachfläche) in px
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Kalibrierung
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });
  const [countOrtgang, setCountOrtgang] = useState<string>("");
  const [countTraufe,  setCountTraufe]  = useState<string>("");
  const [lenOrtgangM,  setLenOrtgangM]  = useState<string>("");
  const [lenTraufeM,   setLenTraufeM]   = useState<string>("");

  // Referenz-Segmente (je 2 Punkte) in px
  const [segOrtgang, setSegOrtgang] = useState<Pt[]>([]);
  const [segTraufe,  setSegTraufe]  = useState<Pt[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Module: Maße, Ausrichtung, Stil, etc.
  const [moduleWmm, setModuleWmm] = useState<number>(1176);
  const [moduleHmm, setModuleHmm] = useState<number>(1134);
  const [orientation, setOrientation] = useState<"horizontal" | "vertikal">("horizontal");
  const [moduleStyle, setModuleStyle] = useState<"fullblack" | "duo">("fullblack"); // Optik
  const [opacity, setOpacity] = useState<number>(0.9);

  // Projektives Raster (Viereck) – Eckpunkte in px (TL, TR, BR, BL)
  const [frame, setFrame] = useState<Pt[] | null>(null);
  const [frameDrag, setFrameDrag] = useState<{ type: "move" | "corner"; idx?: number } | null>(null);

  // Generierte Module (als Polygone in px, projektiv verformt)
  const [modules, setModules] = useState<ModulePoly[]>([]);

  // Modus
  const [mode, setMode] = useState<"polygon" | "segOrtgang" | "segTraufe" | "frame" | "modules">("polygon");

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

  /** Klick ins Bild */
  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = relPos(e);

    if (mode === "segOrtgang") { setSegOrtgang(prev => (prev.length >= 2 ? [p] : [...prev, p])); return; }
    if (mode === "segTraufe")  { setSegTraufe(prev  => (prev.length >= 2 ? [p] : [...prev, p]));  return; }

    if (mode === "modules") {
      // Toggle-Modul (Hit-Test)
      for (let i = modules.length - 1; i >= 0; i--) {
        if (pointInPolygon(p.x, p.y, modules[i].polyPx)) {
          setModules(prev => {
            const cp = [...prev];
            cp[i] = { ...cp[i], removed: !cp[i].removed };
            return cp;
          });
          return;
        }
      }
    }

    if (mode === "polygon" && !closed) setPoints(prev => [...prev, p]);
  };

  /** Dragging: Polygonpunkte und Frame */
  const onMouseDownOverlay = (e: React.MouseEvent) => {
    const p = relPos(e);
    if (mode === "frame" && frame) {
      // 1) Ecke erwischt?
      const hitCorner = frame.findIndex(pt => distance(pt, p) < 12);
      if (hitCorner >= 0) { setFrameDrag({ type: "corner", idx: hitCorner }); return; }
      // 2) Sonst Bewegung des gesamten Rahmens starten
      setFrameDrag({ type: "move" });
      return;
    }
  };
  const onMouseMoveOverlay = (e: React.MouseEvent) => {
    // Polygon-Dragging
    if (dragIndex !== null) {
      const p = relPos(e);
      setPoints(prev => { const cp = [...prev]; cp[dragIndex] = p; return cp; });
    }
    // Frame-Dragging
    if (frame && frameDrag) {
      const p = relPos(e);
      if (frameDrag.type === "corner" && frameDrag.idx !== undefined) {
        setFrame(prev => {
          if (!prev) return prev;
          const cp = [...prev];
          cp[frameDrag.idx!] = p;
          return cp;
        });
      } else if (frameDrag.type === "move") {
        // Delta ermitteln via Bewegung gegenüber letztem MouseMove:
        // Wir benutzen hier event.movementX/Y (relativ zum letzten Move).
        const dx = (e as any).movementX ?? 0;
        const dy = (e as any).movementY ?? 0;
        setFrame(prev => prev?.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) ?? prev);
      }
    }
  };
  const onMouseUpOverlay = () => { setDragIndex(null); setFrameDrag(null); };

  /** Polygonpunkt-Drag starten */
  const startDragPoint = (i: number) => (e: React.MouseEvent) => { e.preventDefault(); setDragIndex(i); };

  /** Maßstab berechnen (aus Ortgang & Traufe) */
  const recomputeScale = () => {
    const mpps: number[] = [];
    // Ortgang
    if (segOrtgang.length === 2) {
      const px = distance(segOrtgang[0], segOrtgang[1]);
      if (px > 0) {
        if (cover.kind === "tile") {
          const spec = TILE_SPECS_CM[cover.variant];
          const c = parseFloat(countOrtgang.replace(",", "."));
          if (isFinite(c) && c > 0) mpps.push((c * spec.w_cm / 100) / px);
        } else {
          const m = parseFloat(lenOrtgangM.replace(",", "."));
          if (isFinite(m) && m > 0) mpps.push(m / px);
        }
      }
    }
    // Traufe
    if (segTraufe.length === 2) {
      const px = distance(segTraufe[0], segTraufe[1]);
      if (px > 0) {
        if (cover.kind === "tile") {
          const spec = TILE_SPECS_CM[cover.variant];
          const c = parseFloat(countTraufe.replace(",", "."));
          if (isFinite(c) && c > 0) mpps.push((c * spec.h_cm / 100) / px);
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

  /** Fläche in m² (Polygon) */
  const areaM2 =
    closed && points.length >= 3 && metersPerPixel
      ? polygonAreaPx2(points) * metersPerPixel * metersPerPixel
      : null;

  /** Raster-Rahmen initialisieren (aus Polygon-BBox, 30cm Rand) */
  const initFrameFromPolygon = () => {
    if (!metersPerPixel || points.length < 3) { alert("Bitte zuerst Maßstab setzen und Polygon schließen."); return; }
    if (!closed) { alert("Bitte zuerst das Polygon schließen."); return; }
    // Bounding Box
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    // 30 cm Rand (in px)
    const pxPerM = 1 / metersPerPixel;
    const marginPx = 0.30 * pxPerM;
    const f: Pt[] = [
      { x: minX + marginPx, y: minY + marginPx }, // TL
      { x: maxX - marginPx, y: minY + marginPx }, // TR
      { x: maxX - marginPx, y: maxY - marginPx }, // BR
      { x: minX + marginPx, y: maxY - marginPx }, // BL
    ];
    setFrame(f);
    setMode("frame");
    setModules([]); // altes Raster verwerfen
  };

  /** Bilineare Abbildung in Viereck (näherungsweise perspektivisch) */
  // frame: [TL, TR, BR, BL], u,v ∈ [0..1]
  const mapUVtoPx = (u: number, v: number, fr: Pt[]) => {
    const [tl, tr, br, bl] = fr;
    const x = (1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x;
    const y = (1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y;
    return { x, y };
  };

  /** Module projektiv erzeugen (als Polygone in px) */
  const placeModulesPerspective = () => {
    if (!frame || !metersPerPixel) { alert("Bitte zuerst Frame initialisieren und Maßstab setzen."); return; }
    if (!closed || points.length < 3) { alert("Bitte zuerst das Polygon schließen."); return; }

    const pxPerM = 1 / metersPerPixel;

    // "lokale" Abmessungen des Frames in m (oben & links als Referenzlängen)
    const topM   = distance(frame[0], frame[1]) * metersPerPixel;
    const leftM  = distance(frame[0], frame[3]) * metersPerPixel;

    // Modulmaß + 2cm Fuge
    const baseWm = (moduleWmm / 1000);
    const baseHm = (moduleHmm / 1000);
    const gap = 0.02; // 2cm

    const modW = orientation === "horizontal" ? baseWm : baseHm;
    const modH = orientation === "horizontal" ? baseHm : baseWm;

    // iteriere im (u,v)-Raum über reale Meter
    const res: ModulePoly[] = [];
    for (let yM = 0; yM + modH <= leftM + 1e-9; yM += (modH + gap)) {
      for (let xM = 0; xM + modW <= topM + 1e-9; xM += (modW + gap)) {
        // 4 Eckpunkte in UV
        const u0 = xM / topM, v0 = yM / leftM;
        const u1 = (xM + modW) / topM, v1 = (yM + modH) / leftM;

        const pTL = mapUVtoPx(u0, v0, frame);
        const pTR = mapUVtoPx(u1, v0, frame);
        const pBR = mapUVtoPx(u1, v1, frame);
        const pBL = mapUVtoPx(u0, v1, frame);
        const poly = [pTL, pTR, pBR, pBL];

        // nur Module, deren Mittelpunkt innerhalb des Polygons (Dachfläche) liegt
        const c = mapUVtoPx((u0+u1)/2, (v0+v1)/2, frame);
        if (!pointInPolygon(c.x, c.y, points)) continue;

        res.push({ id: `${res.length}`, polyPx: poly });
      }
    }

    setModules(res);
    setMode("modules"); // direkt in den Bearbeiten-Modus
  };

  /** Reset */
  const clearModules = () => setModules([]);
  const resetAll = () => {
    setPoints([]); setDragIndex(null); setClosed(false);
    setSegOrtgang([]); setSegTraufe([]); setMetersPerPixel(null);
    setModules([]); setFrame(null); setFrameDrag(null);
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
                if (k === "tile") setCover({ kind: "tile", variant: v as any });
                else setCover({ kind: "sheet", variant: v as any });
                setSegOrtgang([]); setSegTraufe([]);
                setCountOrtgang(""); setCountTraufe(""); setLenOrtgangM(""); setLenTraufeM("");
                setMetersPerPixel(null);
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

          <span><b>Modus:</b> {
            mode === "polygon" ? "Polygon setzen" :
            mode === "segOrtgang" ? "Ortgang-Segment" :
            mode === "segTraufe" ? "Traufe-Segment" :
            mode === "frame" ? "Raster-Rahmen bearbeiten" :
            "Module bearbeiten"
          }</span>
        </div>

        {/* Referenzen */}
        {cover.kind === "tile" ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Ziegel <b>Ortgang</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countOrtgang} onChange={(e)=>setCountOrtgang(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setMode("segOrtgang")}>Segment Ortgang (2 Klicks)</button>
              <span>{segOrtgang.length}/2 Punkte {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Ziegel <b>Traufe</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countTraufe} onChange={(e)=>setCountTraufe(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setMode("segTraufe")}>Segment Traufe (2 Klicks)</button>
              <span>{segTraufe.length}/2 Punkte {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Länge <b>Ortgang</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenOrtgangM} onChange={(e)=>setLenOrtgangM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setMode("segOrtgang")}>Segment Ortgang (2 Klicks)</button>
              <span>{segOrtgang.length}/2 Punkte {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Länge <b>Traufe</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenTraufeM} onChange={(e)=>setLenTraufeM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setMode("segTraufe")}>Segment Traufe (2 Klicks)</button>
              <span>{segTraufe.length}/2 Punkte {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={recomputeScale}>Maßstab berechnen</button>
          <button onClick={() => setMode("polygon")}>Polygon setzen</button>
          <button onClick={() => { setSegOrtgang([]); setSegTraufe([]); setMetersPerPixel(null); }}>
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
                <option value="horizontal">horizontal</option>
                <option value="vertikal">vertikal</option>
              </select>
            </label>
            <label>Stil:
              <select value={moduleStyle} onChange={(e)=>setModuleStyle(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="fullblack">Full-Black</option>
                <option value="duo">Duo (2 Felder)</option>
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
            <button onClick={()=>setMode("modules")} disabled={modules.length===0}>Module bearbeiten</button>
            <button onClick={clearModules} disabled={modules.length===0}>Module löschen</button>
          </div>

          {metersPerPixel
            ? <b>Maßstab: {metersPerPixel.toFixed(5)} m/px {closed && points.length>=3 && <> • Fläche: {(polygonAreaPx2(points)*metersPerPixel*metersPerPixel).toFixed(2)} m²</>}</b>
            : <span>Maßstab noch nicht gesetzt – Referenzen + „Maßstab berechnen“.</span>}
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
            style={{ maxWidth: "100%", display: "block", cursor: "crosshair" }}
            onClick={onImgClick}
          />

          {/* SVG-Overlay: pointerEvents:'none', interaktive Elemente bekommen 'auto' */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <defs>
              {/* Full-Black Optik */}
              <pattern id="mod-fullblack" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="100" height="100" fill="#0b0b0b" />
                {/* leichte Zellstruktur */}
                <path d="M0 50 H100 M50 0 V100" stroke="#111" strokeWidth="2"/>
                <rect x="0" y="0" width="100" height="100" fill="none" stroke="#161616" strokeWidth="4" />
              </pattern>
              {/* Duo Optik */}
              <pattern id="mod-duo" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="100" height="100" fill="#121212" />
                <rect x="2" y="2" width="96" height="96" fill="#0f0f0f" stroke="#202020" strokeWidth="3"/>
                <line x1="50" y1="6" x2="50" y2="94" stroke="#1a1a1a" strokeWidth="3"/>
                <line x1="50" y1="6" x2="50" y2="94" stroke="#2a2a2a" strokeWidth="1" opacity="0.5"/>
              </pattern>
            </defs>

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

            {/* Modul-Polygone (projektiv) */}
            {modules.map(m => {
              if (m.removed) return null;
              const pts = m.polyPx.map(p => `${p.x},${p.y}`).join(" ");
              const fillId = moduleStyle === "fullblack" ? "mod-fullblack" : "mod-duo";
              return (
                <polygon key={m.id} points={pts} fill={`url(#${fillId})`}
                         opacity={opacity} stroke="#111" strokeWidth={0.6} />
              );
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

            {/* Ziehbare Polygon-Punkte */}
            {points.map((p, i) => (
              <circle key={`p-${i}`} cx={p.x} cy={p.y} r={6}
                      fill={i===dragIndex ? "#d00" : "red"}
                      style={{ cursor: "grab", pointerEvents: "auto" }}
                      onMouseDown={startDragPoint(i)} />
            ))}

            {/* Raster-Rahmen mit ziehbaren Ecken + Move */}
            {frame && (
              <>
                {/* Kanten */}
                {[0,1,2,3].map(i=>{
                  const a = frame[i], b = frame[(i+1)%4];
                  return <line key={`f-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                               stroke="#ffbf00" strokeWidth={2} strokeDasharray="6 4" />;
                })}
                {/* Ecken */}
                {frame.map((p, i)=>(
                  <rect key={`fc-${i}`} x={p.x-6} y={p.y-6} width={12} height={12}
                        fill="#ffbf00" stroke="#7c5a00" strokeWidth={1}
                        style={{ pointerEvents: "auto", cursor: "grab" }}
                        onMouseDown={(e)=>{ e.preventDefault(); setMode("frame"); setFrameDrag({type:"corner", idx:i}); }} />
                ))}
                {/* Move-Hitbox (transparent) */}
                <polygon
                  points={frame.map(p=>`${p.x},${p.y}`).join(" ")}
                  fill="transparent"
                  style={{ pointerEvents: "auto", cursor: "move" }}
                  onMouseDown={(e)=>{ e.preventDefault(); setMode("frame"); setFrameDrag({type:"move"}); }}
                />
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
