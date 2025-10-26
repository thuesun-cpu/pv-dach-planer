import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton: { w_cm: 30, h_cm: 33, label: "Doppelfalzziegel / Beton 30×33 cm" },
  tonstein: { w_cm: 30, h_cm: 33, label: "Tonstein 30×33 cm" },
  jumbo: { w_cm: 34, h_cm: 36, label: "Jumboziegel 34×36 cm" },
} as const;

function distance(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function polygonAreaPx2(pts: Pt[]) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);

  // Polygon
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Kalibrierung
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });

  // Ziegel-Referenzen: Anzahl
  const [countOrtgang, setCountOrtgang] = useState<string>("");
  const [countTraufe, setCountTraufe] = useState<string>("");

  // Blech/Bitumen-Referenzen: Längen (m)
  const [lenOrtgangM, setLenOrtgangM] = useState<string>("");
  const [lenTraufeM, setLenTraufeM] = useState<string>("");

  // Segmentpunkte (je 2)
  const [segOrtgang, setSegOrtgang] = useState<Pt[]>([]);
  const [segTraufe, setSegTraufe] = useState<Pt[]>([]);

  // Maßstab
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Modus
  const [setMode, setSetMode] = useState<"polygon" | "segOrtgang" | "segTraufe">("polygon");

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Position relativ zum Bild
  const relPos = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  // Klick ins Bild
  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = relPos(e);
    if (setMode === "segOrtgang") {
      setSegOrtgang(prev => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (setMode === "segTraufe") {
      setSegTraufe(prev => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (!closed) setPoints(prev => [...prev, p]); // Polygon
  };

  // Dragging von Polygonpunkten
  const startDrag = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragIndex(i);
  };
  const onMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const p = relPos(e);
    setPoints(prev => {
      const cp = [...prev];
      cp[dragIndex] = p;
      return cp;
    });
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
          const meters = parseFloat(lenOrtgangM.replace(",", "."));
          if (isFinite(meters) && meters > 0) mpps.push(meters / px);
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
          const meters = parseFloat(lenTraufeM.replace(",", "."));
          if (isFinite(meters) && meters > 0) mpps.push(meters / px);
        }
      }
    }

    if (mpps.length === 0) setMetersPerPixel(null);
    else if (mpps.length === 1) setMetersPerPixel(mpps[0]);
    else setMetersPerPixel((mpps[0] + mpps[1]) / 2);
  };

  const areaM2 =
    closed && points.length >= 3 && metersPerPixel
      ? polygonAreaPx2(points) * metersPerPixel * metersPerPixel
      : null;

  const resetAll = () => {
    setPoints([]);
    setDragIndex(null);
    setClosed(false);
    setSegOrtgang([]);
    setSegTraufe([]);
    setMetersPerPixel(null);
  };

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
          reader.onload = () => {
            setImage(reader.result as string);
            resetAll();
          };
          reader.readAsDataURL(file);
        }}
      />

      {/* Steuerleiste */}
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Dachhaut:&nbsp;
            <select
              value={
                cover.kind === "tile"
                  ? `tile:${cover.variant}`
                  : `sheet:${cover.variant}`
              }
              onChange={(e) => {
                const [k, v] = e.target.value.split(":");
                if (k === "tile") setCover({ kind: "tile", variant: v as any });
                else setCover({ kind: "sheet", variant: v as any });
                setSegOrtgang([]); setSegTraufe([]);
                setCountOrtgang(""); setCountTraufe("");
                setLenOrtgangM(""); setLenTraufeM("");
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

          <span><b>Aktiver Modus:</b> {setMode === "polygon" ? "Polygon setzen" : setMode === "segOrtgang" ? "Ortgang-Segment" : "Traufe-Segment"}</span>
        </div>

        {cover.kind === "tile" ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Ziegel <b>Ortgang</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countOrtgang} onChange={(e)=>setCountOrtgang(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setSetMode("segOrtgang")}>Segment Ortgang setzen (2 Klicks)</button>
              <span>{segOrtgang.length}/2 Punkte {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Ziegel <b>Traufe</b> (Anzahl):&nbsp;
                <input type="number" min={1} value={countTraufe} onChange={(e)=>setCountTraufe(e.target.value)} style={{ width: 100 }} />
              </label>
              <button onClick={() => setSetMode("segTraufe")}>Segment Traufe setzen (2 Klicks)</button>
              <span>{segTraufe.length}/2 Punkte {segTraufe.length===2 && "✅"}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Länge <b>Ortgang</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenOrtgangM} onChange={(e)=>setLenOrtgangM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setSetMode("segOrtgang")}>Segment Ortgang setzen (2 Klicks)</button>
              <span>{segOrtgang.length}/2 Punkte {segOrtgang.length===2 && "✅"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Länge <b>Traufe</b> (m):&nbsp;
                <input type="number" step="0.01" value={lenTraufeM} onChange={(e)=>setLenTraufeM(e.target.value)} style={{ width: 120 }} />
              </label>
              <button onClick={() => setSetMode("segTraufe")}>Segment Traufe setzen (2 Klicks)</button>
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
          onMouseMove={onMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <img
            ref={imgRef}
            src={image}
            alt="Dach"
            style={{ maxWidth: "100%", display: "block", cursor: "crosshair" }}
            onClick={onImgClick}
          />

          {/* WICHTIG: pointerEvents:'none' erlaubt Bild-Klicks, 
              kreis-Punkte aktivieren wir pro Element mit pointerEvents:'auto' */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {/* Referenz-Segmente */}
            {segOrtgang.map((p, i) => (
              <circle key={`o-${i}`} cx={p.x} cy={p.y} r={5} fill="#0070f3" />
            ))}
            {segOrtgang.length === 2 && (
              <line x1={segOrtgang[0].x} y1={segOrtgang[0].y} x2={segOrtgang[1].x} y2={segOrtgang[1].y}
                    stroke="#0070f3" strokeWidth={2} strokeDasharray="6 4" />
            )}

            {segTraufe.map((p, i) => (
              <circle key={`t-${i}`} cx={p.x} cy={p.y} r={5} fill="#00b894" />
            ))}
            {segTraufe.length === 2 && (
              <line x1={segTraufe[0].x} y1={segTraufe[0].y} x2={segTraufe[1].x} y2={segTraufe[1].y}
                    stroke="#00b894" strokeWidth={2} strokeDasharray="6 4" />
            )}

            {/* Polygon offen */}
            {!closed &&
              points.map((p, i) => {
                const n = points[i + 1];
                return n ? (
                  <line key={`l-${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="red" strokeWidth={2} />
                ) : null;
              })}

            {/* Polygon gefüllt */}
            {closed && points.length >= 3 && (
              <polygon
                points={points.map(p => `${p.x},${p.y}`).join(" ")}
                fill="rgba(255,0,0,0.18)"
                stroke="red"
                strokeWidth={2}
              />
            )}

            {/* Ziehbare Punkte */}
            {points.map((p, i) => (
              <circle
                key={`p-${i}`}
                cx={p.x}
                cy={p.y}
                r={6}
                fill={i === dragIndex ? "#d00" : "red"}
                style={{ cursor: "grab", pointerEvents: "auto" }}
                onMouseDown={startDrag(i)}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
