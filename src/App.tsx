import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";

/** === kleine Geometrie-Utils === */
type Pt = { x: number; y: number };

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const len = (a: Pt) => Math.hypot(a.x, a.y);

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function lineIntersection(p: Pt, r: Pt, q: Pt, s: Pt): Pt | null {
  const rxs = r.x * s.y - r.y * s.x;
  const qmp = { x: q.x - p.x, y: q.y - p.y };
  const qmpxr = qmp.x * r.y - qmp.y * r.x;
  if (Math.abs(rxs) < 1e-9) return null;
  const t = (qmp.x * s.y - qmp.y * s.x) / rxs;
  const u = qmpxr / rxs;
  if (t >= 0 && u >= 0 && u <= 1) return { x: p.x + t * r.x, y: p.y + t * r.y };
  return null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Entfernung Punkt–Strecke (px) */
function distPointToSegPx(p: Pt, a: Pt, b: Pt) {
  const ap = sub(p, a);
  const ab = sub(b, a);
  const t = clamp(dot(ap, ab) / (dot(ab, ab) || 1), 0, 1);
  const proj = add(a, mul(ab, t));
  return len(sub(p, proj));
}

/** min Dist Punkt–Polygon-Rand (px) */
function minDistToEdgesPx(p: Pt, poly: Pt[]) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    m = Math.min(m, distPointToSegPx(p, a, b));
  }
  return m;
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 4 Eckpunkte eines konvexen 4-Ecks zurück als Array-Helper */
function rectFromTLTRBRBL(tl: Pt, tr: Pt, br: Pt, bl: Pt) {
  return [tl, tr, br, bl] as Pt[];
}

/** Punkt-in-Polygon (konvex/konkav) */
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

/** Stichpunkte auf Rahmenkanten, um Abstände robust zu testen */
function sampleEdgePoints(rect: Pt[]): Pt[] {
  const [tl, tr, br, bl] = rect;
  const c = mid(tl, br);
  return [tl, tr, br, bl, mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl), c];
}

/* =================== Komponente =================== */

export default function PVDachPlaner() {
  // Bild
  const [image, setImage] = useState<string | null>(null);

  // Polygon P1=Traufe links, P2=Traufe rechts, P3=Ortgang/First rechts (für Maßstab & Orientierung)
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut + Ziegelreferenz
  const [cover, setCover] = useState<{ kind: "tile" | "sheet"; variant: "doppelfalz_betonstein" | "einfalz_tonstein" | "doppelfalz_tonstein" | "jumbo" }>({
    kind: "tile",
    variant: "doppelfalz_betonstein",
  });

  const [countOrtgang, setCountOrtgang] = useState<string>(""); // Ziegelanzahl an der Traufe (zur Maßstabsermittlung)
  const [countTraufe, setCountTraufe] = useState<string>("");
  const [lenOrtgangM, setLenOrtgangM] = useState<string>(""); // alternativ: Längenangaben in m
  const [lenTraufeM, setLenTraufeM] = useState<string>("");

  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);

  // Modul-Parameter
  const [moduleWmm, setModuleWmm] = useState<number>(1176);
  const [moduleHmm, setModuleHmm] = useState<number>(1134);

  // Sicherheitsabstand (Außenkante!) – cm, Standard 30
  const [edgeMarginCm, setEdgeMarginCm] = useState<number>(30);

  const [orientation, setOrientation] = useState<"vertikal" | "horizontal">("vertikal");
  const [moduleStyle, setModuleStyle] = useState<"fullblack" | "vertex">("fullblack");
  const [opacity, setOpacity] = useState<number>(0.85);

  // berechnete Module in UV (u=links→rechts entlang Traufe, v=oben→unten zum Traufe)
  const [modulesUV, setModulesUV] = useState<{ u: number; v: number; w: number; h: number; hidden?: boolean }[]>([]);

  /** ==================== UI Hilfen ==================== */

  const roofSizeFromVariant = useCallback(() => {
    // Sichtmaß Breite×Höhe (m) pro Ziegel
    switch (cover.variant) {
      case "einfalz_tonstein": return { bw: 0.215, bh: 0.33 };
      case "doppelfalz_tonstein": return { bw: 0.30, bh: 0.33 };
      case "doppelfalz_betonstein": return { bw: 0.30, bh: 0.33 };
      case "jumbo": return { bw: 0.34, bh: 0.36 };
      default: return { bw: 0.30, bh: 0.33 };
    }
  }, [cover.variant]);

  /** Rahmen-Reihenfolge erzwingen: TL, TR, BR, BL */
  const canonicalFrame = useCallback((poly: Pt[]): Pt[] | null => {
    if (poly.length < 4) return null;
    // wir nehmen eine konvexe Hülle in Klickreihenfolge an
    // sortiere grob über min/max
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    const minx = Math.min(...xs), maxx = Math.max(...xs);
    const miny = Math.min(...ys), maxy = Math.max(...ys);
    // finde die vier Ecken nahe minx/miny, maxx/miny, maxx/maxy, minx/maxy
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

  /** Maßstab aus Ziegeln ODER aus expliziten Metern */
  const computeMetersPerPixel = useCallback((frame: Pt[]) => {
    if (frame.length !== 4) return null;
    const { bw, bh } = roofSizeFromVariant();
    // Wenn Nutzer Traufe/Ortgang in Ziegeln angibt:
    if (countOrtgang && countTraufe) {
      const tra = parseFloat(countTraufe);
      const ort = parseFloat(countOrtgang);
      if (isFinite(tra) && isFinite(ort) && tra > 0 && ort > 0) {
        const pxTraufe = dist(frame[0], frame[1]); // TL→TR
        const pxOrt = dist(frame[0], frame[3]);    // TL→BL
        const mTraufe = tra * bw;
        const mOrt = ort * bh;
        const mppTraufe = mTraufe / pxTraufe;
        const mppOrt = mOrt / pxOrt;
        return (mppTraufe + mppOrt) / 2;
      }
    }
    // ansonsten Längen in m falls gesetzt
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

  /** UV-Anker-Offsets in Meter – immer links/oben starten + Mindestabstand einhalten */
  const findAnchorOffsetsM = useCallback((frame: Pt[], mpp: number) => {
    const topM = dist(frame[0], frame[1]) * mpp;   // TL→TR
    const leftM = dist(frame[0], frame[3]) * mpp;  // TL→BL
    const edgeMarginM = edgeMarginCm / 100;
    return { uOffM: edgeMarginM, vOffM: edgeMarginM, topM, leftM };
  }, [edgeMarginCm]);

  /** Prüft Mindestabstand+voll im Polygon */
  const acceptModuleUV = useCallback((
    rect: Pt[], poly: Pt[], mpp: number
  ) => {
    const samples = sampleEdgePoints(rect);
    const edgeMarginM = edgeMarginCm / 100; // m
    for (const s of samples) {
      if (!pointInPoly(s, poly)) return false;
      if (minDistToEdgesPx(s, poly) * mpp < edgeMarginM) return false;
    }
    return true;
  }, [edgeMarginCm]);

  /** Frame-Ermittlung (4 Ecken TL,TR,BR,BL) */
  const frame = useMemo(() => canonicalFrame(points), [points, canonicalFrame]);

  /** Maßstab automatisch neu, sobald Rahmen geschlossen wird */
  useEffect(() => {
    if (!closed || !frame) return;
    const mpp = computeMetersPerPixel(frame);
    if (mpp) setMetersPerPixel(mpp);
  }, [closed, frame, computeMetersPerPixel]);

  /** Wenn Frame + Maßstab da: Module automatisch neu zeichnen */
  useEffect(() => {
    if (!frame || !metersPerPixel) return;

    const mpp = metersPerPixel;
    const edgeMarginM = edgeMarginCm / 100;

    // Projektive Basis: Achse u (Traufe), v (Ortgang)
    const tl = frame[0], tr = frame[1], br = frame[2], bl = frame[3];
    const uAxis = sub(tr, tl);    // entlang Traufe
    const vAxis = sub(bl, tl);    // zum Traufe (oben -> unten)

    // metrische Gesamtlängen entlang u/v
    const totalUM = dist(tl, tr) * mpp;
    const totalVM = dist(tl, bl) * mpp;

    // Modulgröße in Meter (abhängig von Orientierung)
    const modWm = (orientation === "vertikal" ? moduleWmm : moduleHmm) / 1000;
    const modHm = (orientation === "vertikal" ? moduleHmm : moduleWmm) / 1000;

    // verfügbare Fläche in m (außen 30 cm o. eingestellter Rand abziehen)
    const usableUM = Math.max(0, totalUM - 2 * edgeMarginM);
    const usableVM = Math.max(0, totalVM - 2 * edgeMarginM);

    const cols = Math.max(0, Math.floor(usableUM / modWm));
    const rows = Math.max(0, Math.floor(usableVM / modHm));

    const newUV: { u: number; v: number; w: number; h: number; hidden?: boolean }[] = [];

    // Start links/oben = edgeMarginM
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u0 = edgeMarginM + c * modWm;
        const v0 = edgeMarginM + r * modHm;

        // vier Eckpunkte im Bild (projektiv angenähert via bilinear)
        const uvToPx = (u: number, v: number): Pt => {
          const su = u / totalUM, sv = v / totalVM;
          // bilinear Mischung TL,TR,BR,BL
          const a = add(mul(tl, (1 - su) * (1 - sv)), mul(tr, su * (1 - sv)));
          const b = add(mul(bl, (1 - su) * sv), mul(br, su * sv));
          return add(a, sub(b, a));
        };

        const pTL = uvToPx(u0, v0);
        const pTR = uvToPx(u0 + modWm, v0);
        const pBR = uvToPx(u0 + modWm, v0 + modHm);
        const pBL = uvToPx(u0, v0 + modHm);

        const rect = [pTL, pTR, pBR, pBL];
        const poly = frame;

        if (acceptModuleUV(rect, poly, mpp)) {
          newUV.push({ u: u0, v: v0, w: modWm, h: modHm });
        }
      }
    }

    setModulesUV(newUV);
  }, [frame, metersPerPixel, edgeMarginCm, orientation, moduleWmm, moduleHmm, acceptModuleUV]);

  /** Bild laden */
  const onPickImage = useCallback((f: File | null) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setImage(rd.result as string);
    rd.readAsDataURL(f);
  }, []);

  /** Polygon-Interaktion */
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (closed) return;
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPoints(prev => [...prev, p]);
  }, [closed]);

  const onClosePolygon = useCallback(() => {
    if (points.length < 4) return;
    setClosed(true);
  }, [points.length]);

  const resetAll = useCallback(() => {
    setPoints([]); setClosed(false);
    setMetersPerPixel(null);
    setModulesUV([]);
  }, []);

  /** Rendering Hilfen */
  const moduleFill = useMemo(() => {
    if (moduleStyle === "fullblack") return "rgba(20,20,20,1)";
    return "rgba(20,20,20,1)"; // Vertex: gleicher Look, nur Linien betonen
  }, [moduleStyle]);

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
        {/* Polygon/Ecken */}
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
        {closed && frame && modulesUV.map((m, idx) => {
          const [tl, tr, br, bl] = frame;
          const totalUM = dist(tl, tr) * (metersPerPixel ?? 1);
          const totalVM = dist(tl, bl) * (metersPerPixel ?? 1);
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
                    stroke="rgba(255,120,0,0.2)"
                    strokeWidth={1} />
              {/* vertikale Modul-Fugen-Linien (nur optisch) */}
              <path d={`M ${pTL.x},${pTL.y} L ${pBL.x},${pBL.y}`}
                    stroke="rgba(255,120,0,0.25)" strokeWidth={1} />
              <path d={`M ${pTR.x},${pTR.y} L ${pBR.x},${pBR.y}`}
                    stroke="rgba(255,120,0,0.25)" strokeWidth={1} />
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
