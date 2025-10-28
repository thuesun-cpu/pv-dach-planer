import React, { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };
type ModuleUV = {
  id: string;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  removed?: boolean;
};

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33 },
  doppelfalz_beton: { w_cm: 30, h_cm: 33 },
  tonstein: { w_cm: 30, h_cm: 33 },
  jumbo: { w_cm: 34, h_cm: 36 },
} as const;
type TileVariant = keyof typeof TILE_SPECS_CM;
const SHEET_VARIANTS = ["bitumen", "wellblech", "trapezblech"] as const;
type SheetVariant = (typeof SHEET_VARIANTS)[number];
type RoofCover =
  | { kind: "tile"; variant: TileVariant }
  | { kind: "sheet"; variant: SheetVariant };

const TILE_VARIANTS = Object.keys(TILE_SPECS_CM) as TileVariant[];
const formatVariantLabel = (key: string) =>
  key
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

type ModuleStyle = "full" | "vertex";
type Orientation = "vertikal" | "horizontal";

const EDGE_M = 0.35;
const GAP_M = 0.02;
const SHRINK = 0.965;
const EPS = 1e-9;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const areaPx2 = (poly: Pt[]) => {
  if (poly.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
};
const pip = (x: number, y: number, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
};
const dPointSeg = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const len = C * C + D * D;
  const t = Math.max(0, Math.min(1, len ? dot / len : 0));
  const xx = x1 + t * C;
  const yy = y1 + t * D;
  return Math.hypot(px - xx, py - yy);
};
const minDistToEdges = (p: Pt, poly: Pt[]) => {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    m = Math.min(m, dPointSeg(p.x, p.y, a.x, a.y, b.x, b.y));
  }
  return m;
};
const samplesOn = (poly: Pt[]) => {
  const [tl, tr, br, bl] = poly;
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return [tl, tr, br, bl, mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl)];
};

const mapUV = (u: number, v: number, fr: Pt[]) => {
  const [tl, tr, br, bl] = fr;
  return {
    x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x,
    y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y,
  };
};
const uvRectToPoly = (m: ModuleUV, fr: Pt[]) => {
  const pTL = mapUV(m.u0, m.v0, fr);
  const pTR = mapUV(m.u1, m.v0, fr);
  const pBR = mapUV(m.u1, m.v1, fr);
  const pBL = mapUV(m.u0, m.v1, fr);
  return [pTL, pTR, pBR, pBL];
};

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const [closedPoly, setClosedPoly] = useState<Pt[] | null>(null);

  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "doppelfalz_beton" });
  const [cntTraufe, setCntTraufe] = useState("37");
  const [cntOrtgang, setCntOrtgang] = useState("21");
  const [lenTraufeM, setLenTraufeM] = useState("");
  const [lenOrtgangM, setLenOrtgangM] = useState("");
  const [mpp, setMpp] = useState<number | null>(null);

  const [moduleWmm, setModuleWmm] = useState(1134);
  const [moduleHmm, setModuleHmm] = useState(1765);
  const [orientation, setOrientation] = useState<Orientation>("vertikal");
  const [moduleStyle, setModuleStyle] = useState<ModuleStyle>("full");
  const [opacity, setOpacity] = useState(0.9);

  const [frame, setFrame] = useState<Pt[] | null>(null);
  const [mods, setMods] = useState<ModuleUV[]>([]);
  const [grid, setGrid] = useState<{ nx: number; ny: number } | null>(null);
  const [mode, setMode] = useState<"polygon" | "modules">("polygon");
  const imgRef = useRef<HTMLImageElement | null>(null);

  const rel = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = rel(e);
    if (mode === "modules" && frame) {
      for (let i = mods.length - 1; i >= 0; i--) {
        const poly = uvRectToPoly(mods[i], frame);
        if (pip(p.x, p.y, poly)) {
          setMods(prev => {
            const cp = [...prev];
            cp[i] = { ...cp[i], removed: !cp[i].removed };
            return cp;
          });
          return;
        }
      }
      return;
    }
    if (!closed) {
      setPts(prev => [...prev, p]);
    }
  };
  const onMove = (e: React.MouseEvent) => {
    if (drag !== null) {
      const p = rel(e);
      setPts(prev => {
        const cp = [...prev];
        cp[drag] = p;
        return cp;
      });
    }
  };

  const computeMPP = (poly: Pt[]): number | null => {
    if (poly.length < 3) return null;
    const [p1, p2, p3] = [poly[0], poly[1], poly[2]];
    const pxTraufe = dist(p1, p2);
    const pxOrtgang = dist(p2, p3);
    const arr: number[] = [];
    if (cover.kind === "tile") {
      const spec = TILE_SPECS_CM[cover.variant];
      const cT = parseFloat((cntTraufe || "").replace(",", "."));
      const cO = parseFloat((cntOrtgang || "").replace(",", "."));
      if (isFinite(cT) && cT > 0 && pxTraufe > 0) {
        arr.push((cT * spec.h_cm) / 100 / pxTraufe);
      }
      if (isFinite(cO) && cO > 0 && pxOrtgang > 0) {
        arr.push((cO * spec.w_cm) / 100 / pxOrtgang);
      }
    } else {
      const mT = parseFloat((lenTraufeM || "").replace(",", "."));
      const mO = parseFloat((lenOrtgangM || "").replace(",", "."));
      if (isFinite(mT) && mT > 0 && pxTraufe > 0) {
        arr.push(mT / pxTraufe);
      }
      if (isFinite(mO) && mO > 0 && pxOrtgang > 0) {
        arr.push(mO / pxOrtgang);
      }
    }
    if (arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };

  const buildFrame = (poly: Pt[]): Pt[] | null => {
    if (poly.length < 3) return null;
    const p1 = poly[0];
    const p2 = poly[1];
    const p3 = poly[2];
    const p4 = poly.length >= 4 ? poly[3] : { x: p1.x + (p3.x - p2.x), y: p1.y + (p3.y - p2.y) };
    return [p1, p2, p3, p4];
  };

  const placeModules = (mppLocal: number, fr: Pt[], roofPoly: Pt[]) => {
    if (!isFinite(mppLocal) || mppLocal <= 0) return;
    if (!fr || fr.length !== 4) return;
    if (!roofPoly || roofPoly.length < 3) return;

    const topM = dist(fr[0], fr[1]) * mppLocal;
    const leftM = dist(fr[0], fr[3]) * mppLocal;
    if (topM > 200 || leftM > 200) return;

    const Wm = moduleWmm / 1000;
    const Hm = moduleHmm / 1000;
    const modW = orientation === "vertikal" ? Wm : Hm;
    const modH = orientation === "vertikal" ? Hm : Wm;
    const stopU = topM - EDGE_M;
    const stopV = leftM - EDGE_M;

    const out: ModuleUV[] = [];
    let nx = 0;
    let ny = 0;
    let id = 0;
    let safety = 0;
    let v = EDGE_M;
    while (v + modH <= stopV + EPS && safety++ < 2000) {
      let u = EDGE_M;
      let rowCount = 0;
      while (u + modW <= stopU + EPS && safety++ < 4000) {
        const u0r = u / topM;
        const v0r = v / leftM;
        const u1r = (u + modW) / topM;
        const v1r = (v + modH) / leftM;
        const uc = (u0r + u1r) / 2;
        const vc = (v0r + v1r) / 2;
        const hu = ((u1r - u0r) / 2) * SHRINK;
        const hv = ((v1r - v0r) / 2) * SHRINK;
        const u0 = uc - hu;
        const u1 = uc + hu;
        const v0 = vc - hv;
        const v1 = vc + hv;
        const poly = [
          mapUV(u0, v0, fr),
          mapUV(u1, v0, fr),
          mapUV(u1, v1, fr),
          mapUV(u0, v1, fr),
        ];
        const okInside = samplesOn(poly).every(s => pip(s.x, s.y, roofPoly));
        const okMargin = samplesOn(poly).every(
          s => minDistToEdges(s, roofPoly) * mppLocal >= EDGE_M - 1e-6,
        );
        if (!okInside || !okMargin) break;
        out.push({ id: String(id++), u0, v0, u1, v1 });
        rowCount++;
        u += modW + GAP_M;
      }
      if (rowCount === 0) break;
      if (nx === 0) nx = rowCount;
      ny++;
      v += modH + GAP_M;
    }

    setMods(out);
    setGrid({ nx, ny });
    setMode("modules");
  };

  const handleClose = () => {
    if (pts.length < 3) return;
    if (areaPx2(pts) < EPS) {
      alert("❌ Polygon zu klein oder degeneriert.");
      return;
    }
    const currentPts = pts.map(p => ({ ...p }));
    setMods([]);
    setGrid(null);
    setClosed(false);
    setClosedPoly(null);
    const mLocal = computeMPP(currentPts);
    const fLocal = buildFrame(currentPts);
    if (!mLocal || !isFinite(mLocal) || mLocal <= 0 || !fLocal) {
      alert("❌ Maßstab oder Polygon ungültig.");
      return;
    }
    setFrame(fLocal);
    setMpp(mLocal);
    setClosedPoly(currentPts);
    setClosed(true);
  };

  useEffect(() => {
    if (closed && mpp && frame && closedPoly) {
      placeModules(mpp, frame, closedPoly);
    }
  }, [closed, mpp, frame, closedPoly, moduleWmm, moduleHmm, orientation]);

  useEffect(() => {
    if (!closed || !closedPoly) return;
    const next = computeMPP(closedPoly);
    if (!next || !isFinite(next) || next <= 0) return;
    if (mpp === null || Math.abs(mpp - next) > 1e-6) {
      setMpp(next);
    }
  }, [closed, closedPoly, cover, cntTraufe, cntOrtgang, lenTraufeM, lenOrtgangM, mpp]);

  const resetAll = () => {
    setPts([]);
    setClosed(false);
    setClosedPoly(null);
    setMpp(null);
    setFrame(null);
    setMods([]);
    setGrid(null);
    setMode("polygon");
  };

  const pxPerM = mpp ? 1 / mpp : 0;
  const polygonPoints = pts.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div>
    <div style={{ fontFamily: "Inter, Arial, sans-serif", padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <h1>PV-Dach-Planer</h1>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = () => setImage(reader.result as string)
            reader.readAsDataURL(file)
          }
        onChange={e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            setImage(r.result as string);
            resetAll();
          };
          r.readAsDataURL(f);
        }}
      />

      <div style={{ marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <strong>Modus:</strong> {mode === "polygon" ? "Polygon setzen" : "Module bearbeiten"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button onClick={handleClose} disabled={pts.length < 3}>
              Polygon schließen
            </button>
            <button onClick={resetAll}>Fläche zurücksetzen</button>
            {mode === "modules" && (
              <button onClick={() => setMode("polygon")}>Polygon bearbeiten</button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label>
              Deckungsart
              <select
                value={cover.kind}
                onChange={e => {
                  const kind = e.target.value as RoofCover["kind"];
                  setCover(prev => {
                    if (kind === "tile") {
                      const variant: TileVariant = prev.kind === "tile" ? prev.variant : "doppelfalz_beton";
                      return { kind: "tile", variant };
                    }
                    const variant: SheetVariant = prev.kind === "sheet" ? prev.variant : "bitumen";
                    return { kind: "sheet", variant };
                  });
                }}
                style={{ width: "100%" }}
              >
                <option value="tile">Ziegeldeckung (Stückzahl)</option>
                <option value="sheet">Bahnware/Platten (Längen)</option>
              </select>
            </label>
            <label>
              Variante
              <select
                value={cover.variant}
                onChange={e => {
                  if (cover.kind === "tile") {
                    setCover({ kind: "tile", variant: e.target.value as TileVariant });
                  } else {
                    setCover({ kind: "sheet", variant: e.target.value as SheetVariant });
                  }
                }}
                style={{ width: "100%" }}
              >
                {(cover.kind === "tile" ? TILE_VARIANTS : SHEET_VARIANTS).map(opt => (
                  <option key={opt} value={opt}>
                    {formatVariantLabel(opt)}
                  </option>
                ))}
              </select>
            </label>
            {cover.kind === "tile" ? (
              <>
                <label>
                  Ziegel Traufe
                  <input
                    value={cntTraufe}
                    onChange={e => setCntTraufe(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
                <label>
                  Ziegel Ortgang
                  <input
                    value={cntOrtgang}
                    onChange={e => setCntOrtgang(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Traufe Länge (m)
                  <input
                    value={lenTraufeM}
                    onChange={e => setLenTraufeM(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
                <label>
                  Ortgang Länge (m)
                  <input
                    value={lenOrtgangM}
                    onChange={e => setLenOrtgangM(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            Modulbreite (mm)
            <input
              type="number"
              min={200}
              value={moduleWmm}
              onChange={e => setModuleWmm(Number(e.target.value) || moduleWmm)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Modulhöhe (mm)
            <input
              type="number"
              min={200}
              value={moduleHmm}
              onChange={e => setModuleHmm(Number(e.target.value) || moduleHmm)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Ausrichtung
            <select
              value={orientation}
              onChange={e => setOrientation(e.target.value as Orientation)}
              style={{ width: "100%" }}
            >
              <option value="vertikal">Vertikal</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
          <label>
            Darstellung
            <select
              value={moduleStyle}
              onChange={e => setModuleStyle(e.target.value as ModuleStyle)}
              style={{ width: "100%" }}
            >
              <option value="full">Vollfläche</option>
              <option value="vertex">Eckpunkte</option>
            </select>
          </label>
          <label>
            Deckkraft
            <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <strong>Info</strong>
          </div>
          <div>Modulraster: {grid ? `${grid.nx} × ${grid.ny}` : "-"}</div>
          <div>Maßstab: {mpp ? `${mpp.toFixed(5)} m/px` : "-"}</div>
          <div>Pixel pro Meter: {pxPerM ? pxPerM.toFixed(1) : "-"}</div>
          <div>Anzahl Module aktiv: {mods.filter(m => !m.removed).length}</div>
        </div>
      </div>

      {image && (
        <div style={{ marginTop: 20 }}>
          <img src={image} alt="Dach" style={{ maxWidth: '100%' }} />
        <div
          style={{ position: "relative", marginTop: 20, border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden" }}
          onMouseMove={onMove}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
        >
          <img
            ref={imgRef}
            src={image}
            alt="Dach"
            style={{ width: "100%", display: "block", cursor: mode === "modules" ? "pointer" : "crosshair" }}
            onClick={onImgClick}
          />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <defs>
              <pattern id="fullb" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="100" height="100" fill="#0b0b0b" />
                <path d="M0 50 H100 M50 0 V100" stroke="#111" strokeWidth={2} />
                <rect x="0" y="0" width="100" height="100" fill="none" stroke="#161616" strokeWidth={4} />
              </pattern>
            </defs>

            {pts.length >= 2 && (
              <polyline
                points={polygonPoints}
                fill={closed ? "rgba(0, 102, 204, 0.1)" : "none"}
                stroke="#0f62fe"
                strokeDasharray={closed ? undefined : "6 4"}
                strokeWidth={2}
              />
            )}
            {closed && pts.length >= 3 && <polygon points={polygonPoints} fill="rgba(15, 98, 254, 0.12)" stroke="none" />}

            {frame &&
              mods.map(m => {
                if (m.removed) return null;
                const poly = uvRectToPoly(m, frame);
                const ptsS = poly.map(p => `${p.x},${p.y}`).join(" ");
                if (moduleStyle === "full") {
                  return (
                    <polygon
                      key={m.id}
                      points={ptsS}
                      fill="url(#fullb)"
                      opacity={opacity}
                      stroke="#111"
                      strokeWidth={0.6}
                    />
                  );
                }
                const cx = (poly[0].x + poly[2].x) / 2;
                const cy = (poly[0].y + poly[2].y) / 2;
                return (
                  <g key={m.id} opacity={opacity}>
                    <polygon points={ptsS} fill="none" stroke="#f2f4f8" strokeDasharray="4 4" strokeWidth={0.8} />
                    <circle cx={cx} cy={cy} r={3.2} fill="#f2f4f8" />
                  </g>
                );
              })}

            {pts.map((p, i) => (
              <g key={`pt-${i}`}>
                <circle cx={p.x} cy={p.y} r={6} fill="#ffffff" stroke="#0f62fe" strokeWidth={2} opacity={0.85} />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={10}
                  fill="transparent"
                  style={{ pointerEvents: "all", cursor: "grab" }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setDrag(i);
                  }}
                />
              </g>
            ))}

            {closed && frame && (
              <text x={frame[0].x} y={frame[0].y - 8} fill="#fff" fontSize={12}>
                {grid ? `${grid.nx * grid.ny} Module` : ""}
              </text>
            )}
          </svg>
        </div>
      )}
    </div>
  )
}
  );
}
