import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM: Record<
  NonNullable<Extract<RoofCover, { kind: "tile" }>["variant"]>,
  { w_cm: number; h_cm: number; label: string }
> = {
  einfalz: { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton: { w_cm: 30, h_cm: 33, label: "Doppelfalzziegel / Beton 30×33 cm" },
  tonstein: { w_cm: 30, h_cm: 33, label: "Tonstein 30×33 cm" },
  jumbo: { w_cm: 34, h_cm: 36, label: "Jumboziegel 34×36 cm" },
};

// --- Geometrie-Utils ---
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

// --- Komponente ---
export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);

  // Polygon
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Kalibrierung
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });

  // Ziegel-Referenz: Anzahl entlang Kanten (Integer)
  const [countOrtgang, setCountOrtgang] = useState<string>(""); // # Ziegel über Ortgang
  const [countTraufe, setCountTraufe] = useState<string>("");   // # Ziegel über Traufe

  // Blech/Bitumen-Referenz: reale Längen in m
  const [lenOrtgangM, setLenOrtgangM] = useState<string>("");
  const [lenTraufeM, setLenTraufeM] = useState<string>("");

  // Referenz-Segmente auf dem Bild (je 2 Klicks)
  const [segOrtgang, setSegOrtgang] = useState<Pt[]>([]);
  const [segTraufe, setSegTraufe] = useState<Pt[]>([]);

  // finaler Maßstab (m/px) – wird aus beiden Richtungen gemittelt, wenn vorhanden
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Modus für „welches Segment wird gerade gesetzt?“
  const [setMode, setSetMode] = useState<"none" | "segOrtgang" | "segTraufe" | "polygon">("polygon");

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Mausposition relativ zum Bild
  const relPos = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  // --- Click-Handling ---
  const onImgClick = (e: React.MouseEvent) => {
    const p = relPos(e);

    if (setMode === "segOrtgang") {
      setSegOrtgang((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (setMode === "segTraufe") {
      setSegTraufe((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (setMode === "polygon" && !closed) {
      setPoints((prev) => [...prev, p]);
    }
  };

  // Dragging von Polygonpunkten
  const startDrag = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragIndex(i);
  };
  const onMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const p = relPos(e);
    setPoints((prev) => {
      const cp = [...prev];
      cp[dragIndex] = p;
      return cp;
    });
  };
  const endDrag = () => setDragIndex(null);

  // Maßstab berechnen
  const recomputeScale = () => {
    let mpp: number[] = [];

    if (segOrtgang.length === 2) {
      const px = distance(segOrtgang[0], segOrtgang[1]);
      if (cover.kind === "tile") {
        const spec = TILE_SPECS_CM[cover.variant];
        const count = parseFloat(countOrtgang.replace(",", "."));
        if (px > 0 && isFinite(count) && count > 0) {
          const meters = (count * spec.w_cm) / 100; // Breite pro Ziegel
          mpp.push(meters / px);
        }
      } else {
        const meters = parseFloat(lenOrtgangM.replace(",", "."));
        if (px > 0 && isFinite(meters) && meters > 0) {
          mpp.push(meters / px);
        }
      }
    }

    if (segTraufe.length === 2) {
      const px = distance(segTraufe[0], segTraufe[1]);
      if (cover.kind === "tile") {
        const spec = TILE_SPECS_CM[cover.variant];
        const count = parseFloat(countTraufe.replace(",", "."));
        if (px > 0 && isFinite(count) && count > 0) {
          const meters = (count * spec.h_cm) / 100; // Sichtmaß Höhe
          mpp.push(meters / px);
        }
      } else {
        const meters = parseFloat(lenTraufeM.replace(",", "."));
        if (px > 0 && isFinite(meters) && meters > 0) {
          mpp.push(meters / px);
        }
      }
    }

    if (mpp.length === 0) {
      setMetersPerPixel(null);
    } else if (mpp.length === 1) {
      setMetersPerPixel(mpp[0]);
    } else {
      // Mittelwert beider Richtungen
      setMetersPerPixel((mpp[0] + mpp[1]) / 2);
    }
  };

  // Fläche (m²), wenn geschlossen + Maßstab vorhanden
  const areaM2 =
    closed && points.length >= 3 && metersPerPixel
      ? polygonAreaPx2(points) * metersPerPixel * metersPerPixel
      : null;

  // Reset-Helfer
  const resetAll = () => {
    setPoints([]);
    setDragIndex(null);
    setClosed(false);
    setSegOrtgang([]);
    setSegTraufe([]);
    setMetersPerPixel(null);
  };

  // UI-Helfer
  const CoverControls = () => (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Dachhaut:&nbsp;
          <select
            value={`${cover.kind}:${(cover as any).variant}`}
            onChange={(e) => {
              const [k, v] = e.target.value.split(":");
              if (k === "tile") setCover({ kind: "tile", variant: v as any });
              else setCover({ kind: "sheet", variant: v as any });
              // Referenzen zurücksetzen bei Wechsel
              setSegOrtgang([]);
              setSegTraufe([]);
              setCountOrtgang("");
              setCountTraufe("");
              setLenOrtgangM("");
              setLenTraufeM("");
              setMetersPerPixel(null);
            }}
          >
            {/* Ziegelarten */}
            <option value="tile:einfalz">{TILE_SPECS_CM.einfalz.label}</option>
            <option value="tile:doppelfalz_beton">{TILE_SPECS_CM.doppelfalz_beton.label}</option>
            <option value="tile:tonstein">{TILE_SPECS_CM.tonstein.label}</option>
            <option value="tile:jumbo">{TILE_SPECS_CM.jumbo.label}</option>
            {/* Blech/Bitumen */}
            <option value="sheet:bitumen">Bitumendach</option>
            <option value="sheet:wellblech">Wellblech (≥ 0,7 mm)</option>
            <option value="sheet:trapezblech">Trapezblech (≥ 0,7 mm)</option>
          </select>
        </label>
      </div>

      {cover.kind === "tile" ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>
              Ziegel **Ortgang** (Anzahl):&nbsp;
              <input
                type="number"
                min={1}
                value={countOrtgang}
                onChange={(e) => setCountOrtgang(e.target.value)}
                style={{ width: 100 }}
              />
            </label>
            <button onClick={() => setSetMode("segOrtgang")}>
              Segment Ortgang im Bild setzen (2 Klicks)
            </button>
            <span>
              {segOrtgang.length}/2 Punkte {segOrtgang.length === 2 && "✅"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>
              Ziegel **Traufe** (Anzahl):&nbsp;
              <input
                type="number"
                min={1}
                value={countTraufe}
                onChange={(e) => setCountTraufe(e.target.value)}
                style={{ width: 100 }}
              />
            </label>
            <button onClick={() => setSetMode("segTraufe")}>
              Segment Traufe im Bild setzen (2 Klicks)
            </button>
            <span>
              {segTraufe.length}/2 Punkte {segTraufe.length === 2 && "✅"}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>
              Länge **Ortgang** (m):&nbsp;
              <input
                type="number"
                step="0.01"
                min={0}
                value={lenOrtgangM}
                onChange={(e) => setLenOrtgangM(e.target.value)}
                style={{ width: 120 }}
              />
            </label>
            <button onClick={() => setSetMode("segOrtgang")}>
              Segment Ortgang im Bild setzen (2 Klicks)
            </button>
            <span>
              {segOrtgang.length}/2 Punkte {segOrtgang.length === 2 && "✅"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>
              Länge **Traufe** (m):&nbsp;
              <input
                type="number"
                step="0.01"
                min={0}
                value={lenTraufeM}
                onChange={(e) => setLenTraufeM(e.target.value)}
                style={{ width: 120 }}
              />
            </label>
            <button onClick={() => setSetMode("segTraufe")}>
              Segment Traufe im Bild setzen (2 Klicks)
            </button>
            <span>
              {segTraufe.length}/2 Punkte {segTraufe.length === 2 && "✅"}
            </span>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={recomputeScale}>Maßstab berechnen</button>
        <button onClick={() => setSetMode("polygon")}>Polygon setzen</button>
        <button onClick={() => { setSegOrtgang([]); setSegTraufe([]); setMetersPerPixel(null); }}>
          Referenz-Segmente löschen
        </button>
      </div>
    </div>
  );

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

      {/* Controls */}
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <CoverControls />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setClosed((c) => !c)} disabled={points.length < 3}>
            {closed ? "Polygon öffnen" : "Polygon schließen"}
          </button>
          <button onClick={() => setPoints((p) => p.slice(0, -1))} disabled={points.length === 0 || closed}>
            Letzten Punkt löschen
          </button>
          <button onClick={resetAll} disabled={!points.length && !segOrtgang.length && !segTraufe.length}>
            Alles zurücksetzen
          </button>
        </div>

        <div>
          {metersPerPixel ? (
            <b>
              Maßstab: {metersPerPixel.toFixed(5)} m/px
              {closed && points.length >= 3 && (
                <> • Fläche: { (polygonAreaPx2(points)*metersPerPixel*metersPerPixel).toFixed(2) } m²</>
              )}
            </b>
          ) : (
            <span>Maßstab noch nicht gesetzt – Referenz(en) setzen & „Maßstab berechnen“ klicken.</span>
          )}
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

          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {/* Referenz-Segmente */}
            {segOrtgang.map((p, i) => (
              <circle key={`o-${i}`} cx={p.x} cy={p.y} r={5} fill="#0070f3" />
            ))}
            {segOrtgang.length === 2 && (
              <line
                x1={segOrtgang[0].x}
                y1={segOrtgang[0].y}
                x2={segOrtgang[1].x}
                y2={segOrtgang[1].y}
                stroke="#0070f3"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}

            {segTraufe.map((p, i) => (
              <circle key={`t-${i}`} cx={p.x} cy={p.y} r={5} fill="#00b894" />
            ))}
            {segTraufe.length === 2 && (
              <line
                x1={segTraufe[0].x}
                y1={segTraufe[0].y}
                x2={segTraufe[1].x}
                y2={segTraufe[1].y}
                stroke="#00b894"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}

            {/* Polygon (offen) */}
            {!closed &&
              points.map((p, i) => {
                const n = points[i + 1];
                return n ? (
                  <line key={`l-${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="red" strokeWidth={2} />
                ) : null;
              })}

            {/* Gefülltes Polygon */}
            {closed && points.length >= 3 && (
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(255,0,0,0.18)"
                stroke="red"
                strokeWidth={2}
              />
            )}

            {/* Punkte (ziehbar) */}
            {points.map((p, i) => (
              <circle
                key={`p-${i}`}
                cx={p.x}
                cy={p.y}
                r={6}
                fill={i === dragIndex ? "#d00" : "red"}
                style={{ cursor: "grab" }}
                onMouseDown={startDrag(i)}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
