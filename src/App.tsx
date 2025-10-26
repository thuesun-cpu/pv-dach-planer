import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };

function distance(a: Pt, b: Pt) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Shoelace-Formel (liefert Fläche in Pixel^2)
function polygonAreaPx2(pts: Pt[]) {
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

  // Kalibrierung
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);
  const [calibLengthInput, setCalibLengthInput] = useState<string>(""); // in m
  const [calibMode, setCalibMode] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);

  const getPos = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    return { x, y };
  };

  // Klick ins Bild
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const pos = getPos(e);

    if (calibMode) {
      // Kalibrierpunkte setzen (max 2)
      setCalibPts((prev) => {
        const next = [...prev, pos].slice(-2);
        return next;
      });
      return;
    }

    // Polygon-Punkte setzen
    if (closed) return; // geschlossen: keine neuen Punkte
    setPoints((prev) => [...prev, pos]);
  };

  // Dragging
  const startDrag = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragIndex(idx);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const { x, y } = getPos(e);
    setPoints((prev) => {
      const cp = [...prev];
      cp[dragIndex] = { x, y };
      return cp;
    });
  };
  const endDrag = () => setDragIndex(null);

  // Kalibrierung anwenden: m/px berechnen
  const applyCalibration = () => {
    if (calibPts.length !== 2) return;
    const px = distance(calibPts[0], calibPts[1]);
    const meters = parseFloat(calibLengthInput.replace(",", "."));
    if (!isFinite(meters) || meters <= 0 || px <= 0) return;
    setMetersPerPixel(meters / px);
    setCalibMode(false);
  };

  // Fläche in m² (falls geschlossen + kalibriert)
  const areaM2 =
    closed && points.length >= 3 && metersPerPixel
      ? polygonAreaPx2(points) * metersPerPixel * metersPerPixel
      : null;

  const resetPolygon = () => {
    setPoints([]);
    setClosed(false);
    setDragIndex(null);
  };

  const resetCalibration = () => {
    setCalibPts([]);
    setMetersPerPixel(null);
    setCalibLengthInput("");
  };

  return (
    <div>
      {/* Bild-Upload */}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            setImage(reader.result as string);
            // bei neuem Bild alles zurücksetzen
            resetPolygon();
            resetCalibration();
          };
          reader.readAsDataURL(file);
        }}
      />

      {/* Tools */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={() => setCalibMode((v) => !v)}>
          {calibMode ? "Kalibriermodus: AN (klicke 2 Punkte)" : "Kalibriermodus starten"}
        </button>
        <button onClick={resetCalibration} disabled={!metersPerPixel && calibPts.length === 0}>
          Kalibrierung löschen
        </button>
        <button onClick={() => setClosed((c) => !c)} disabled={points.length < 3}>
          {closed ? "Polygon öffnen" : "Polygon schließen"}
        </button>
        <button onClick={resetPolygon} disabled={points.length === 0}>
          Fläche zurücksetzen
        </button>
        <button
          onClick={() => setPoints((prev) => prev.slice(0, -1))}
          disabled={points.length === 0 || closed}
        >
          Letzten Punkt löschen
        </button>
      </div>

      {/* Kalibrier-Länge eingeben */}
      {calibMode && calibPts.length === 2 && (
        <div style={{ marginTop: 8 }}>
          <label>
            Reale Länge zwischen den zwei Punkten (m):{" "}
            <input
              type="number"
              step="0.01"
              style={{ width: 120 }}
              value={calibLengthInput}
              onChange={(e) => setCalibLengthInput(e.target.value)}
            />
          </label>
          <button style={{ marginLeft: 8 }} onClick={applyCalibration} disabled={!calibLengthInput}>
            Maßstab übernehmen
          </button>
        </div>
      )}

      {/* Statusanzeige */}
      <div style={{ marginTop: 8 }}>
        {metersPerPixel ? (
          <span>
            Maßstab: {metersPerPixel.toFixed(5)} m/px
            {areaM2 !== null && (
              <> • Fläche: <b>{areaM2.toFixed(2)} m²</b></>
            )}
          </span>
        ) : (
          <span>Kein Maßstab gesetzt – bitte kalibrieren.</span>
        )}
      </div>

      {/* Bild + Overlay */}
      {image && (
        <div
          style={{ marginTop: 16, position: "relative", display: "inline-block" }}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <img
            ref={imgRef}
            src={image}
            alt="Dach"
            style={{ maxWidth: "100%", display: "block", cursor: calibMode ? "crosshair" : "crosshair" }}
            onClick={handleImageClick}
          />

          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            {/* Kalibrier-Linie */}
            {calibPts.length >= 1 &&
              calibPts.map((p, i) => (
                <circle key={`k-${i}`} cx={p.x} cy={p.y} r={5} fill="#00b" />
              ))}
            {calibPts.length === 2 && (
              <>
                <line
                  x1={calibPts[0].x}
                  y1={calibPts[0].y}
                  x2={calibPts[1].x}
                  y2={calibPts[1].y}
                  stroke="#00b"
                  strokeDasharray="6 4"
                  strokeWidth={2}
                />
                <text
                  x={(calibPts[0].x + calibPts[1].x) / 2}
                  y={(calibPts[0].y + calibPts[1].y) / 2 - 8}
                  fontSize={12}
                  textAnchor="middle"
                  fill="#00b"
                >
                  {metersPerPixel
                    ? `${(distance(calibPts[0], calibPts[1]) * metersPerPixel).toFixed(2)} m`
                    : `${Math.round(distance(calibPts[0], calibPts[1]))} px`}
                </text>
              </>
            )}

            {/* Gefüllte Fläche wenn geschlossen */}
            {closed && points.length >= 3 && (
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(255,0,0,0.18)"
                stroke="red"
                strokeWidth={2}
              />
            )}

            {/* Linien (offenes Polygon) */}
            {!closed &&
              points.map((p, i) => {
                const next = points[i + 1];
                return next ? (
                  <line key={`l-${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke="red" strokeWidth={2} />
                ) : null;
              })}

            {/* Punkte (drag-fähig) */}
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
