import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };          // Bildkoordinaten in px
type PtM = { x: number; y: number };         // Meter-Koordinaten
type ModuleRect = { id: string; x: number; y: number; w: number; h: number; removed?: boolean }; // in m

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton: { w_cm: 30,  h_cm: 33, label: "Doppelfalzziegel / Beton 30×33 cm" },
  tonstein:         { w_cm: 30,  h_cm: 33, label: "Tonstein 30×33 cm" },
  jumbo:            { w_cm: 34,  h_cm: 36, label: "Jumboziegel 34×36 cm" },
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

// --- Geometrie in Meter (für Raster) ---
function pointInPolygonM(p: PtM, poly: PtM[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function distPointToSegM(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A*C + B*D, lenSq = C*C + D*D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const xx = x1 + t*C, yy = y1 + t*D;
  return Math.hypot(px - xx, py - yy);
}
function minDistToEdgesM(p: PtM, poly: PtM[]) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    m = Math.min(m, distPointToSegM(p.x, p.y, a.x, a.y, b.x, b.y));
  }
  return m;
}

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);

  // Polygon (px)
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Kalibrierung
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });
  const [countOrtgang, setCountOrtgang] = useState<string>("");
  const [countTraufe,  setCountTraufe]  = useState<string>("");
  const [lenOrtgangM,  setLenOrtgangM]  = useState<string>("");
  const [lenTraufeM,   setLenTraufeM]   = useState<string>("");

  const [segOrtgang, setSegOrtgang] = useState<Pt[]>([]);
  const [segTraufe,  setSegTraufe]  = useState<Pt[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Module (m)
  const [modules, setModules] = useState<ModuleRect[]>([]);
  const [moduleWmm, setModuleWmm] = useState<number>(1176);  // Standard
  const [moduleHmm, setModuleHmm] = useState<number>(1134);
  const [orientation, setOrientation] = useState<"horizontal" | "vertikal">("horizontal");
  const [fillSolid, setFillSolid] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.6);

  // Modus
  const [setMode, setSetMode] = useState<"polygon" | "segOrtgang" | "segTraufe" | "modules">("polygon");

  const imgRef = useRef<HTMLImageElement | null>(null);

  const relPos = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = relPos(e);

    if (setMode === "modules") {
      // Modul an/aus toggeln (Hit-Test in m)
      if (!metersPerPixel) return;
      const mpp = metersPerPixel;
      const mx = p.x * mpp, my = p.y * mpp;
      setModules(prev => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i];
          if (mx >= m.x && mx <= m.x + m.w && my >= m.y && my <= m.y + m.h) {
            const copy = [...prev];
            copy[i] = { ...m, removed: !m.removed };
            return copy;
          }
        }
        return prev;
      });
      return;
    }

    if (setMode === "segOrtgang") { setSegOrtgang(prev => (prev.length >= 2 ? [p] : [...prev, p])); return; }
    if (setMode === "segTraufe")  { setSegTraufe(prev  => (prev.length >= 2 ? [p] : [...prev, p]));  return; }

    if (!closed) setPoints(prev => [...prev, p]); // Polygon-Punkt
  };

  // Dragging der Polygonpunkte
  const startDrag = (i: number) => (e: React.MouseEvent) => { e.preventDefault(); setDragIndex(i); };
  const onMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const p = relPos(e);
    setPoints(prev => { const cp = [...prev]; cp[dragIndex] = p; return cp; });
  };
  const endDrag = () => setDragIndex(null);

  // Maßstab berechnen
  const recomputeScale = () => {
    const mpps: number[] = [];
    if (segOrtgang.length === 2) {
      const px = distance(segOrtgang[0], segOrtgang[1]);
      if (px > 0) {
        if (cover.kind === "tile") {
          const spec = TILE_SPECS_CM[cover.variant];
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
          const spec = TILE_SPECS_CM[cover.variant];
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

  // Fläche in m²
  const areaM2 =
    closed && points.length >= 3 && metersPerPixel
      ? polygonAreaPx2(points) * metersPerPixel * metersPerPixel
      : null;

  // Module zeichnen
  const placeModules = () => {
    if (!metersPerPixel) { alert("Bitte zuerst den Maßstab berechnen."); return; }
    if (!closed || points.length < 3) { alert("Bitte zuerst das Polygon schließen."); return; }

    const mpp = metersPerPixel;
    const toM = (p: Pt): PtM => ({ x: p.x * mpp, y: p.y * mpp });
    const polyM: PtM[] = points.map(toM);

    // Modulmaß (m) nach Ausrichtung
    const baseWm = moduleWmm / 1000;
    const baseHm = moduleHmm / 1000;
    const modW = orientation === "horizontal" ? baseWm : baseHm;
    const modH = orientation === "horizontal" ? baseHm : baseWm;

    const MARGIN = 0.30; // 30 cm
    const GAP = 0.02;    // 2 cm

    // grobe Bounding Box in m
    const xs = polyM.map(p => p.x), ys = polyM.map(p => p.y);
    const minX = Math.min(...xs) + MARGIN, maxX = Math.max(...xs) - MARGIN;
    const minY = Math.min(...ys) + MARGIN, maxY = Math.max(...ys) - MARGIN;
    if (minX >= maxX || minY >= maxY) { alert("Fläche ist nach 30 cm Rand zu klein."); return; }

    const stepX = modW + GAP, stepY = modH + GAP;
    const out: ModuleRect[] = [];

    for (let y = minY; y + modH <= maxY + 1e-9; y += stepY) {
      for (let x = minX; x + modW <= maxX + 1e-9; x += stepX) {
        const cx = x + modW / 2, cy = y + modH / 2;
        if (!pointInPolygonM({ x: cx, y: cy }, polyM)) continue;
        const d = minDistToEdgesM({ x: cx, y: cy }, polyM);
        if (d < MARGIN) continue;
        out.push({ id: `${out.length}`, x, y, w: modW, h: modH });
      }
    }
    setModules(out);
    setSetMode("modules"); // in den Module-Bearbeiten-Modus wechseln
  };

  const clearModules = () => setModules([]);

  const resetAll = () => {
    setPoints([]); setDragIndex(null); setClosed(false);
    setSegOrtgang([]); setSegTraufe([]); setMetersPerPixel(null);
    setModules([]);
  };

  // px/m für Zeichnung
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

          <span><b>Aktiver Modus:</b> {
            setMode === "polygon" ? "Polygon setzen" :
            setMode === "segOrtgang" ? "Ortgang-Segment" :
            setMode === "segTraufe" ? "Traufe-Segment" : "Module bearbeiten"
          }</span>
        </div>

        {/* Referenzen */}
        {cover.kind === "tile" ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Ziegel <b>Ortgang</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countOrtgang} onChange={(e)=>setCountOrtgang(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setSetMode("segOrtgang")}>Segment Ortgang (2 Klicks)</button>
              <span>{segOrtgang.length}/2 Punkte {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Ziegel <b>Traufe</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countTraufe} onChange={(e)=>setCountTraufe(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setSetMode("segTraufe")}>Segment Traufe (2 Klicks)</button>
              <span>{segTraufe.length}/2 Punkte {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Länge <b>Ortgang</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenOrtgangM} onChange={(e)=>setLenOrtgangM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setSetMode("segOrtgang")}>Segment Ortgang (2 Klicks)</button>
              <span>{segOrtgang.length}/2 Punkte {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label> Länge <b>Traufe</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenTraufeM} onChange={(e)=>setLenTraufeM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setSetMode("segTraufe")}>Segment Traufe (2 Klicks)</button>
              <span>{segTraufe.length}/2 Punkte {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={recomputeScale}>Maßstab berechnen</button>
          <button onClick={() => setSetMode("polygon")}>Polygon setzen</button>
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

        {/* Modul-Einstellungen */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Module</div>
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
            <button onClick={clearModules} disabled={modules.length===0}>Module löschen</button>
            <button onClick={()=>setSetMode("modules")} disabled={modules.length===0}>Module bearbeiten (anklicken zum Entfernen)</button>
          </div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            Randabstand: 30 cm • Fuge: 2 cm • Klick auf Modul im Modus „Module bearbeiten“ entfernt/aktiviert es.
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

          {/* Zeichnung: pointerEvents:'none' lässt Bild-Klicks durch;
             nur interaktive Punkte setzen wir auf 'auto' */}
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

            {/* Modul-Rechtecke (in px zeichnen) */}
            {metersPerPixel && modules.map(m => {
              if (m.removed) return null;
              const x = m.x * pxPerM, y = m.y * pxPerM, w = m.w * pxPerM, h = m.h * pxPerM;
              return (
                <g key={m.id} opacity={fillSolid ? 1 : opacity}>
                  <rect x={x} y={y} width={w} height={h} fill="#10b981" stroke="#065f46" strokeWidth={1} />
                </g>
              );
            })}

            {/* Polygon offen */}
            {!closed && points.map((p, i) => {
              const n = points[i + 1]; return n ?
                <line key={`l-${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="red" strokeWidth={2} /> : null;
            })}

            {/* Polygon gefüllt */}
            {closed && points.length>=3 && (
              <polygon points={points.map(p=>`${p.x},${p.y}`).join(" ")}
                       fill="rgba(255,0,0,0.18)" stroke="red" strokeWidth={2} />
            )}

            {/* Ziehbare Polygon-Punkte */}
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
