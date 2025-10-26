import React, { useState, useRef } from "react";

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints([...points, { x, y }]);
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              setImage(reader.result as string);
              setPoints([]); // Reset points when new image uploaded
            };
            reader.readAsDataURL(file);
          }
        }}
      />
      {image && (
        <div style={{ marginTop: 20, position: "relative", display: "inline-block" }}>
          <img
            ref={imgRef}
            src={image}
            alt="Dach"
            style={{ maxWidth: "100%", cursor: "crosshair" }}
            onClick={handleImageClick}
          />
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
              width: "100%",
              height: "100%",
            }}
          >
            {points.map((p, i) => {
              const next = points[i + 1];
              return next ? (
                <line
                  key={i}
                  x1={p.x}
                  y1={p.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="red"
                  strokeWidth="2"
                />
              ) : null;
            })}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="red" />
            ))}
          </svg>
        </div>
      )}
      {points.length > 2 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setPoints([])}>Fläche zurücksetzen</button>
        </div>
      )}
    </div>
  );
}
