import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";

/** === kleine Geometrie-Utils === */
type Pt = { x: number; y: number };

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function distPointToSegPx(p: Pt, a: Pt, b: Pt) {
  const ap = sub(p, a);
  const ab = sub(b, a);
  const t = clamp((ap.x * ab.x + ap.y * ab.y) / ((ab.x * ab.x + ab.y * ab.y) || 1), 0, 1);
  const proj = add(a, mul(ab, t));
  return len(sub(p, proj));
}
function minDistToEdgesPx(p: Pt, poly: Pt[]) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    m = Math.min(m, distPointToSegPx(p, a, b));
  }
  return m;
}
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const rectFromTLTRBRBL = (tl: Pt, tr: Pt, br: Pt, bl: Pt) => [tl, tr, br, bl] as Pt[];

function pointInPoly(p: Pt, poly: Pt[]) {
  let wn = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a.y <= p.y) {
      if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0) wn++;
    } else {
      if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0) wn--;
    }
  }
  return wn !== 0;
}
function sampleEdgePoints(rect: Pt[]): Pt[] {
  const [tl, tr, br, bl] = rect;
  const c = mid(tl, br);
  return [tl, tr, br, bl, mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl), c];
}

/* =================== Komponente =================== */

export default function PVDachPlaner() {
  // Bild
  const [image, setImage] = useState<string | null>(null);

  // Polygon
  const [points, setPoints] = useState<Pt[]>([]);
  const [closed, setClosed] = useState(false);

  // Dachhaut + Ziegel-Referenz
  const [cover, setCover] = useState<{
    kind: "tile" | "sheet";
    variant: "doppelfalz_betonstein" | "einfalz_tonstein" | "doppelfalz_tonstein" | "jumbo";
  }>({ kind: "tile", variant: "doppelfalz_betonstein" });

  // *** WICHTIG: Ziegel-Anzahl an Traufe/Ortgang (für Maßstab) ***
  const [countOrtgang, setCountOrtgang] = useState<string>("");
  const [countTraufe, setCountTraufe] = useState<string>("");

  // (optional) Längen in m – aktuell nicht per UI genutzt, aber unterstützt
  const [lenOrtgangM, setLenOrtgangM] = useState<string>("");
  const [lenTraufeM, setLenTraufeM] = useState<string>("");

  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Modul-Parameter
  const [moduleWmm, setModuleWmm] = useState<number>(1176);
  const [moduleHmm, setModuleHmm] = useState<number>(1134);
  const [orientation, setOrientation] = useState<"vertikal" | "horizontal">("vertikal");
  const [moduleStyle, setModuleStyle] = useState<"fullblack" | "vertex">("fullblack");
  const [opacity, setOpacity] = useState<number>(0.85);

  // Sicherheitsabstand außen (cm)
  const [edgeMarginCm, setEdgeMarginCm] = useState<number>(30);

  // Module in UV
  const [modulesUV, setModulesUV] = useState<{ u: number; v: number; w: number; h: number; hidden?: boolean }[]>([]);

  const roofSizeFromVariant = useCallback(() => {
    switch (cover.variant) {
      case "einfalz_tonstein": return { bw: 0.215, bh: 0.33 };
      case "doppelfalz_tonstein": return { bw: 0.30, bh: 0.33 };
      case "doppelfalz_betonstein": return { bw: 0.30, bh: 0.33 };
      case "jumbo": return { bw: 0.34, bh: 0.36 };
      default: return { bw: 0.30, bh: 0.33 };
    }
  }, [cover.variant]);

  const canonicalFrame = useCallback((poly: Pt[]): Pt[] | null => {
    if (poly.length < 4) return null;
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    const minx = Math.min(...xs), maxx = Math.max(...xs);
    const miny = Math.min(...ys), maxy = Math.max(...ys);
    const pick = (tx: number, ty: number) => {
      let best = 1e12, bestP = poly[0];
      for (const p of poly) {
        const d = Math.hypot(p.x - tx, p.y - ty);
        if (d < best) { best = d; bestP = p; }
      }
      return bestP;
    };
    const tl = pick(minx, miny);
    const tr = pick(maxx, miny);
    const br = pick(maxx, maxy);
    const bl = pick(minx, maxy);
    return rectFromTLTRBRBL(tl, tr, br, bl);
  }, []);

  const computeMetersPerPixel = useCallback((frame: Pt[]) => {
    if (frame.length !== 4) return null;
    const { bw, bh } = roofSizeFromVariant();

    // 1) Ziegel-Anzahl vorhanden?
    if (countOrtgang && countTraufe) {
      const tra = parseFloat(countTraufe);
      const ort = parseFloat(countOrtgang);
      if (isFinite(tra) && isFinite(ort) && tra > 0 && ort > 0) {
        const pxTraufe = dist(frame[0], frame[1]);
        const pxOrt = dist(frame[0], frame[3]);
        const mppTraufe = (tra * bw) / pxTraufe;
        const mppOrt = (ort * bh) / pxOrt;
        return (mppTraufe + mppOrt) / 2;
      }
    }
    // 2) alternativ Längen in m
    if (lenTraufeM && lenOrtgangM) {
      const mT = parseFloat(lenTraufeM);
      const mO = parseFloat(lenOrtgangM);
      if (isFinite(mT) && isFinite(mO) && mT > 0 && mO > 0) {
        const pxTraufe = dist(frame[0], frame[1]);
        const pxOrt = dist(frame[0], frame[3]);
        const mppTraufe = mT / pxTraufe;
        const mppOrt = mO / pxOrt;
        return (mppTraufe + mppOrt) / 2;
      }
    }
    return null;
  }, [countOrtgang, countTraufe, lenOrtgangM, lenTraufeM, roofSizeFromVariant]);

  const frame = useMemo(() => canonicalFrame(points), [points, canonicalFrame]);

  // Beim Schließen Maßstab berechnen
  useEffect(() => {
    if (!closed || !frame) return;
    const mpp = computeMetersPerPixel(frame);
    setMetersPerPixel(mpp); // kann null sein, wenn noch keine Zahlen eingegeben sind
  }, [closed, frame, computeMetersPerPixel]);

  // Raster auf Basis Maßstab + Mindestabstand
  useEffect(() => {
    if (!frame || !metersPerPixel) { setModulesUV([]); return; }

    const mpp = metersPerPixel;
    const edgeMarginM = edgeMarginCm / 100;

    const tl = frame[0], tr = frame[1], br = frame[2], bl = frame[3];
    const totalUM = dist(tl, tr) * mpp; // Traufe-Länge
    const totalVM = dist(tl, bl) * mpp; // Ortgang-Länge

    const modWm = (orientation === "vertikal" ? moduleWmm : moduleHmm) / 1000;
    const modHm = (orientation === "vertikal" ? moduleHmm : moduleWmm) / 1000;

    const usableUM = Math.max(0, totalUM - 2 * edgeMarginM);
    const usableVM = Math.max(0, totalVM - 2 * edgeMarginM);

    const cols = Math.max(0, Math.floor(usableUM / modWm));
    const rows = Math.max(0, Math.floor(usableVM / modHm));

    const uvToPx = (u: number, v: number): Pt => {
      const su = u / totalUM, sv = v / totalVM;
      const a = add(mul(tl, (1 - su) * (1 - sv)), mul(tr, su * (1 - sv)));
      const b = add(mul(bl, (1 - su) * sv), mul(br, su * sv));
      return add(a, sub(b, a));
    };

    const newUV: { u: number; v: number; w: number; h: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u0 = edgeMarginM + c * modWm;
        const v0 = edgeMarginM + r * modHm;

        const pTL = uvToPx(u0, v0);
        const pTR = uvToPx(u0 + modWm, v0);
        const pBR = uvToPx(u0 + modWm, v0 + modHm);
        const pBL = uvToPx(u0, v0 + modHm);
        const rect = [pTL, pTR, pBR, pBL];

        const samples = sampleEdgePoints(rect);
        let ok = true;
        for (const s of samples) {
          if (!pointInPoly(s, frame)) { ok = false; break; }
          if (minDistToEdgesPx(s, frame) * mpp < edgeMarginM) { ok = false; break; }
        }
        if (ok) newUV.push({ u: u0, v: v0, w: modWm, h: modHm });
      }
    }

    setModulesUV(newUV);
  }, [frame, metersPerPixel, edgeMarginCm, orientation, moduleWmm, moduleHmm]);

  const onPickImage = useCallback((f: File | null) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setImage(rd.result as string);
    rd.readAsDataURL(f);
  }, []);

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (closed) return;
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPoints(prev => [...prev, p]);
  }, [closed]);

  const onClosePolygon = useCallback(() => {
    if (points.length < 4) return;
    setClosed(true); // Maßstab + Raster laufen automatisch (Effects)
  }, [points.length]);

  const resetAll = useCallback(() => {
    setPoints([]); setClosed(false);
    setMetersPerPixel(null);
    setModulesUV([]);
  }, []);

  const moduleFill = useMemo(() => {
    return "rgba(20,20,20,1)"; // Full-Black/Vertex gleicher Fill; Linien zeigen Raster
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, Arial", fontSize: 14 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Datei auswählen{" "}
          <input type="file" accept="image/*" onChange={e => onPickImage(e.target.files?.[0] ?? null)} />
        </label>

        <span>Modus: <b>{closed ? "Module bearbeiten" : "Polygon setzen"}</b></span>

        <button onClick={() => setPoints([])} disabled={closed || points.length === 0}>Letzten Punkt löschen</button>
        <button onClick={resetAll}>Fläche zurücksetzen</button>

        {/* Anzeige Stil / Transparenz */}
        <label style={{ marginLeft: 6 }}>
          Stil:
          <select value={moduleStyle} onChange={e => setModuleStyle(e.target.value as any)} style={{ marginLeft: 6 }}>
            <option value="fullblack">Full-Black</option>
            <option value="vertex">Vertex</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Transparenz
          <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
        </label>

        {/* *** NEU: Ziegel-Anzahl-Felder sichtbar *** */}
        <label> Ziegel Traufe (Anzahl):
          <input
            type="number" min={1} step={1}
            value={countTraufe}
            onChange={e=>setCountTraufe(e.target.value)}
            style={{ width: 70, marginLeft: 6 }}
          />
        </label>

        <label> Ziegel Ortgang (Anzahl):
          <input
            type="number" min={1} step={1}
            value={countOrtgang}
            onChange={e=>setCountOrtgang(e.target.value)}
            style={{ width: 70, marginLeft: 6 }}
          />
        </label>

        {/* Modulgröße / Ausrichtung */}
        <span style={{ marginLeft: 12 }}>
          Modul (BxH mm):
          <input style={{ width: 60, marginLeft: 6 }} type="number" value={moduleWmm} onChange={e => setModuleWmm(parseInt(e.target.value || "0"))} />
          ×
          <input style={{ width: 60, marginLeft: 6 }} type="number" value={moduleHmm} onChange={e => setModuleHmm(parseInt(e.target.value || "0"))} />
        </span>

        <label style={{ marginLeft: 6 }}>
          Ausrichtung:
          <select value={orientation} onChange={e => setOrientation(e.target.value as any)} style={{ marginLeft: 6 }}>
            <option value="vertikal">vertikal</option>
            <option value="horizontal">horizontal</option>
          </select>
        </label>

        <label> Mindestabstand (cm):
          <input
            type="number" step={1} min={0}
            value={edgeMarginCm}
            onChange={(e)=>setEdgeMarginCm(parseFloat(e.target.value || "0"))}
            style={{ width: 70, marginLeft: 6 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        Maßstab wird beim Schließen automatisch berechnet.
      </div>

      {/* Zeichenfläche */}
      <div
        style={{
          width: "100%",
          minHeight: 480,
          marginTop: 10,
          position: "relative",
          background: image ? `url(${image}) center/contain no-repeat` : "#f6f6f6",
          border: "1px solid #ddd",
        }}
        onClick={onCanvasClick}
      >
        {/* Eckpunkte */}
        {points.map((p, i) => (
          <div key={i}
               style={{
                 position: "absolute", left: p.x - 4, top: p.y - 4, width: 8, height: 8,
                 background: "#ff0", border: "2px solid #f80", borderRadius: 2, boxSizing: "border-box",
               }} />
        ))}
        {/* Linien */}
        {points.length >= 2 && points.map((p, i) => {
          const q = points[(i + 1) % points.length];
          if (!q || (i === points.length - 1 && !closed)) return null;
          const dx = q.x - p.x, dy = q.y - p.y;
          const w = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <div key={`l${i}`}
                 style={{
                   position: "absolute", left: p.x, top: p.y, width: w, height: 0,
                   borderTop: "2px solid #f80", transform: `rotate(${a}deg)`, transformOrigin: "0 0"
                 }} />
          );
        })}

        {/* Module */}
        {closed && frame && metersPerPixel && modulesUV.map((m, idx) => {
          const [tl, tr, br, bl] = frame;
          const totalUM = dist(tl, tr) * metersPerPixel;
          const totalVM = dist(tl, bl) * metersPerPixel;
          const uvToPx = (u: number, v: number): Pt => {
            const su = u / totalUM, sv = v / totalVM;
            const a = add(mul(tl, (1 - su) * (1 - sv)), mul(tr, su * (1 - sv)));
            const b = add(mul(bl, (1 - su) * sv), mul(br, su * sv));
            return add(a, sub(b, a));
          };
          const pTL = uvToPx(m.u, m.v);
          const pTR = uvToPx(m.u + m.w, m.v);
          const pBR = uvToPx(m.u + m.w, m.v + m.h);
          const pBL = uvToPx(m.u, m.v + m.h);
          const path = `M ${pTL.x},${pTL.y} L ${pTR.x},${pTR.y} L ${pBR.x},${pBR.y} L ${pBL.x},${pBL.y} Z`;

          return (
            <svg key={idx} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "auto" }}>
              <path d={path}
                    fill={m.hidden ? "transparent" : moduleFill}
                    fillOpacity={m.hidden ? 0 : opacity}
                    stroke="rgba(255,120,0,0.25)"
                    strokeWidth={1} />
              <path d={`M ${pTL.x},${pTL.y} L ${pBL.x},${pBL.y}`} stroke="rgba(255,120,0,0.25)" strokeWidth={1} />
              <path d={`M ${pTR.x},${pTR.y} L ${pBR.x},${pBR.y}`} stroke="rgba(255,120,0,0.25)" strokeWidth={1} />
            </svg>
          );
        })}
      </div>

      {/* Aktionen */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        {!closed && (
          <button onClick={onClosePolygon} disabled={points.length < 4}>Polygon schließen (auto)</button>
        )}
        {closed && (
          <>
            <button onClick={() => setClosed(false)}>Rahmen bearbeiten</button>
            <button onClick={() => setModulesUV([])} disabled={modulesUV.length === 0}>Module löschen</button>
          </>
        )}
      </div>
    </div>
  );
}
