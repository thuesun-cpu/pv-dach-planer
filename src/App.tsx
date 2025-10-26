import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Klick ins Bild: neuen Punkt anlegen
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints((prev) => [...prev, { x, y }]);
  };

  // Hilfsfunktion: Mausposition → Bildkoordinaten
  const getPos = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    return { x, y };
  };

  // Dragging: Maus bewegen
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const { x, y } = getPos(e);
    setPoints((prev) => {
      const copy = [...prev];
      copy[dragIndex] = { x, y };
      return copy;
    });
  };

  // Dragging: Start / Ende
  const startDrag = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragIndex(idx);
  };
  const endDrag = () => setDragIndex(null);

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            setImage(reader.result as string);
            setPoints([]);      // beim neuen Bild zurücksetzen
            setDragIndex(null);
          };
          reader.readAsDataURL(file);
        }}
      />

      {image && (
        <div
          ref={overlayRef}
          style={{ marginTop: 20, position: "relative", display: "inline-block" }}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <img
            ref={imgRef}
            src={image}
            alt="Dach"
            style={{ maxWidth: "100%", cursor: "crosshair", display: "block" }}
            onClick={handleImageClick}
          />

          {/* Overlay: Linien, Punkte, (optional) Füllung */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none", // Interaktionen nur auf Punkten erlauben
              width: "100%",
              height: "100%",
            }}
          >
            {/* Halbtransparente Fläche, wenn mind. 3 Punkte */}
            {points.length >= 3 && (
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(255,0,0,0.2)"
                stroke="none"
              />
            )}

            {/* Linien (offenes Polygon) */}
            {points.map((p, i) => {
              const next = points[i + 1];
              return next ? (
                <line key={`l-${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke="red" strokeWidth={2} />
              ) : null;
            })}

            {/* Punkte (drag-fähig) */}
            {points.map((p, i) => (
              <circle
                key={`c-${i}`}
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

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button onClick={() => setPoints([])} disabled={points.length === 0}>
          Fläche zurücksetzen
        </button>
        <button
          onClick={() => setPoints((prev) => prev.slice(0, -1))}
          disabled={points.length === 0}
          title="Letzten Punkt entfernen"
        >
          Letzten Punkt löschen
        </button>
      </div>
    </div>
  );
}
