import React, { useRef, useState } from "react";

/** ---------- Typen ---------- */
type Pt = { x: number; y: number };
type ModuleUV = { id: string; u0: number; v0: number; u1: number; v1: number; removed?: boolean };

type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33, label: "Einfalzziegel 21,5×33 cm" },
  doppelfalz_beton: { w_cm: 30,  h_cm: 33, label: "Doppelfalzziegel / Beton 30×33 cm" },
  tonstein:         { w_cm: 30,  h_cm: 33, label: "Tonstein 30×33 cm" },
  jumbo:            { w_cm: 34,  h_cm: 36, label: "Jumboziegel 34×36 cm" },
} as const;

/** Konstanten */
const EDGE_CLEARANCE_M = 0.35;      // 35 cm Mindestabstand außen
const GAP_BETWEEN_M = 0.02;         // 2 cm Fuge
const VISUAL_SHRINK = 0.965;        // 3,5 % kleiner darstellen

/** ---------- Geometrie ---------- */
function distance(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y); }
function polygonAreaPx2(pts: Pt[]) {
  if (pts.length < 3) return 0;
  let s = 0; for (let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length]; s += p.x*q.y - q.x*p.y; }
  return Math.abs(s)/2;
}
function pointInPolygon(px: number, py: number, poly: Pt[]) {
  let inside = false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    const hit = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function distPointToSegPx(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A=px-x1, B=py-y1, C=x2-x1, D=y2-y1;
  const dot=A*C+B*D, len=C*C+D*D;
  const t = Math.max(0, Math.min(1, len? dot/len : 0));
  const xx=x1+t*C, yy=y1+t*D;
  return Math.hypot(px-xx, py-yy);
}
function minDistToEdgesPx(p: Pt, poly: Pt[]) {
  let m = Infinity;
  for (let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    m = Math.min(m, distPointToSegPx(p.x,p.y,a.x,a.y,b.x,b.y));
  }
  return m;
}
function sampleModuleEdgePoints(poly: Pt[]): Pt[] {
  const [tl,tr,br,bl] = poly;
  const mid=(a:Pt,b:Pt)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  return [tl,tr,br,bl, mid(tl,tr),mid(tr,br),mid(br,bl),mid(bl,tl)];
}

/** ---------- Komponente ---------- */
export default function PVDachPlaner() {
  const [image, setImage] = useState<string|null>(null);

  // Polygon
  const [points, setPoints] = useState<Pt[]>([]);
  const [dragIndex, setDragIndex] = useState<number|null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Maßstab
  const [cover, setCover] = useState<RoofCover>({ kind: "tile", variant: "einfalz" });
  const [countTraufe,  setCountTraufe]  = useState<string>("");
  const [countOrtgang, setCountOrtgang] = useState<string>("");
  const [lenTraufeM,   setLenTraufeM]   = useState<string>("");
  const [lenOrtgangM,  setLenOrtgangM]  = useState<string>("");
  const [metersPerPixel, setMetersPerPixel] = useState<number|null>(null);

  // Module
  const [moduleWmm, setModuleWmm] = useState(1134); // deine Defaults
  const [moduleHmm, setModuleHmm] = useState(1765);
  const [orientation, setOrientation] = useState<"horizontal"|"vertikal">("vertikal"); // vertikal als Default
  const [moduleStyle, setModuleStyle] = useState<"fullblack"|"vertex">("fullblack");
  const [opacity, setOpacity] = useState(0.9);

  // Rahmen + UV-Module
  const [frame, setFrame] = useState<Pt[]|null>(null);
  const [frameDrag, setFrameDrag] = useState<{type:"move"|"corner"; idx?:number}|null>(null);
  const [modulesUV, setModulesUV] = useState<ModuleUV[]>([]);
  const [mode, setMode] = useState<"polygon"|"frame"|"modules">("polygon");

  const imgRef = useRef<HTMLImageElement|null>(null);

  const relPos = (e: React.MouseEvent) => {
    const r = imgRef.current?.getBoundingClientRect(); if (!r) return {x:0,y:0};
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
             y: Math.min(Math.max(e.clientY - r.top,  0), r.height) };
  };

  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = relPos(e);
    if (mode==="modules" && frame){
      // Toggle einzelnes Modul
      for (let i=modulesUV.length-1;i>=0;i--){
        const poly = uvRectToPolyPx(modulesUV[i], frame);
        if (pointInPolygon(p.x,p.y,poly)){
          setModulesUV(prev => {
            const cp=[...prev]; cp[i] = {...cp[i], removed: !cp[i].removed}; return cp;
          });
          return;
        }
      }
    } else if (mode==="polygon" && !closed) {
      setPoints(prev => [...prev, p]);
    }
  };

  const onMouseMoveOverlay = (e: React.MouseEvent) => {
    if (dragIndex!==null){
      const p=relPos(e);
      setPoints(prev=>{const cp=[...prev]; cp[dragIndex]=p; return cp;});
    }
    if (frame && frameDrag){
      if (frameDrag.type==="corner" && frameDrag.idx!==undefined){
        const p=relPos(e);
        setFrame(prev=>{ if(!prev) return prev; const cp=[...prev]; cp[frameDrag.idx!]=p; return cp;});
      } else if (frameDrag.type==="move"){
        const dx=(e as any).movementX ?? 0, dy=(e as any).movementY ?? 0;
        setFrame(prev=>prev?.map(pt=>({x:pt.x+dx,y:pt.y+dy})) ?? prev);
      }
    }
  };
  const onMouseUpOverlay = () => { setDragIndex(null); setFrameDrag(null); };

  /** MPP aus den ersten beiden Kanten des Polygons berechnen */
  const computeMPPFromPolygon = (): number|null => {
    if (points.length<3) return null;
    const p1=points[0], p2=points[1], p3=points[2];
    const pxTraufe=distance(p1,p2), pxOrtgang=distance(p2,p3);
    const mpps:number[]=[];

    if (pxTraufe>0){
      if (cover.kind==="tile"){
        const spec=TILE_SPECS_CM[cover.variant];
        const c=parseFloat((countTraufe||"").replace(",","."));
        if (isFinite(c)&&c>0) mpps.push((c*spec.h_cm/100)/pxTraufe);
      } else {
        const m=parseFloat((lenTraufeM||"").replace(",","."));
        if (isFinite(m)&&m>0) mpps.push(m/pxTraufe);
      }
    }
    if (pxOrtgang>0){
      if (cover.kind==="tile"){
        const spec=TILE_SPECS_CM[cover.variant];
        const c=parseFloat((countOrtgang||"").replace(",","."));
        if (isFinite(c)&&c>0) mpps.push((c*spec.w_cm/100)/pxOrtgang);
      } else {
        const m=parseFloat((lenOrtgangM||"").replace(",","."));
        if (isFinite(m)&&m>0) mpps.push(m/pxOrtgang);
      }
    }
    if (mpps.length===0) return null;
    return mpps.length===1 ? mpps[0] : (mpps[0]+mpps[1])/2;
  };

  /** Frame aus Polygon ableiten (P1=BL, P2=BR, P3=TR, P4=TL) → [TL,TR,BR,BL] */
  const buildFrameFromPolygon = (): Pt[]|null => {
    if (points.length<4) return null;
    const p1=points[0], p2=points[1], p3=points[2], p4=points[3];
    return [p4, p3, p2, p1]; // TL,TR,BR,BL
  };

  /** Bilinear Mapping */
  const mapUVtoPx = (u:number, v:number, fr:Pt[]) => {
    const [tl,tr,br,bl]=fr;
    const x=(1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x;
    const y=(1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y;
    return {x,y};
  };
  const uvRectToPolyPx = (m:ModuleUV, fr:Pt[]) => {
    const pTL=mapUVtoPx(m.u0,m.v0,fr), pTR=mapUVtoPx(m.u1,m.v0,fr),
          pBR=mapUVtoPx(m.u1,m.v1,fr), pBL=mapUVtoPx(m.u0,m.v1,fr);
    return [pTL,pTR,pBR,pBL];
  };

  /** Module erzeugen – mit 3,5 % visueller Verkleinerung */
  const placeModulesPerspective = (overrideMPP?:number, overrideFrame?:Pt[]) => {
    const mpp = overrideMPP ?? metersPerPixel;
    const fr  = overrideFrame ?? frame ?? buildFrameFromPolygon();
    if (!closed || !fr || !mpp){ alert("Bitte Polygon schließen & Maßstab berechnen."); return; }

    const topM  = distance(fr[0],fr[1]) * mpp; // First
    const leftM = distance(fr[0],fr[3]) * mpp; // linker Ortgang

    // Orientierung korrekt gemappt + visuelle Verkleinerung
    const Wm=(moduleWmm/1000), Hm=(moduleHmm/1000);
    let modW = (orientation==="vertikal") ? Wm : Hm;
    let modH = (orientation==="vertikal") ? Hm : Wm;
    modW *= VISUAL_SHRINK;
    modH *= VISUAL_SHRINK;

    const usableU = Math.max(0, topM  - 2*EDGE_CLEARANCE_M);
    const usableV = Math.max(0, leftM - 2*EDGE_CLEARANCE_M);
    if (usableU<=0 || usableV<=0){ alert("Dachfläche zu klein bei 35 cm Rand."); return; }

    const out:ModuleUV[]=[];
    let id=0;

    for (let yM = EDGE_CLEARANCE_M; (yM-EDGE_CLEARANCE_M)+modH <= usableV+1e-9; yM += (modH + GAP_BETWEEN_M)){
      for (let xM = EDGE_CLEARANCE_M; (xM-EDGE_CLEARANCE_M)+modW <= usableU+1e-9; xM += (modW + GAP_BETWEEN_M)){
        const u0 = xM / topM, v0 = yM / leftM;
        const u1 = (xM+modW) / topM, v1 = (yM+modH) / leftM;

        const poly = [
          mapUVtoPx(u0,v0,fr), mapUVtoPx(u1,v0,fr),
          mapUVtoPx(u1,v1,fr), mapUVtoPx(u0,v1,fr),
        ];

        // 1) komplettes Modul innen?
        const samples=sampleModuleEdgePoints(poly);
        if (!samples.every(s=>pointInPolygon(s.x,s.y,points))) continue;

        // 2) ≥ 35 cm Abstand zur Außenkante
        const ok = samples.every(s => (minDistToEdgesPx(s,points) * mpp) >= EDGE_CLEARANCE_M);
        if (!ok) continue;

        out.push({ id:String(id++), u0,v0,u1,v1 });
      }
    }

    setFrame(fr);
    setModulesUV(out);
    setMode("modules");
  };

  /** Reset */
  const clearModules = () => setModulesUV([]);
  const resetAll = () => {
    setPoints([]); setDragIndex(null); setClosed(false);
    setMetersPerPixel(null); setModulesUV([]); setFrame(null); setFrameDrag(null);
    setMode("polygon");
  };

  /** Renderhilfe */
  const pxPerM = metersPerPixel ? 1/metersPerPixel : 0;

  return (
    <div>
      {/* Upload */}
      <input type="file" accept="image/*"
        onChange={(e)=>{
          const f=e.target.files?.[0]; if(!f) return;
          const r=new FileReader();
          r.onload=()=>{ setImage(r.result as string); resetAll(); };
          r.readAsDataURL(f);
        }} />

      {/* Steuerleiste */}
      <div style={{marginTop:10, display:"grid", gap:8}}>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <label>
            Dachhaut:&nbsp;
            <select
              value={cover.kind==="tile"?`tile:${cover.variant}`:`sheet:${cover.variant}`}
              onChange={(e)=>{
                const [k,v]=e.target.value.split(":");
                setCover(k==="tile"?{kind:"tile",variant:v as any}:{kind:"sheet",variant:v as any});
                setMetersPerPixel(null);
              }}>
              <option value="tile:einfalz">{TILE_SPECS_CM.einfalz.label}</option>
              <option value="tile:doppelfalz_beton">{TILE_SPECS_CM.doppelfalz_beton.label}</option>
              <option value="tile:tonstein">{TILE_SPECS_CM.tonstein.label}</option>
              <option value="tile:jumbo">{TILE_SPECS_CM.jumbo.label}</option>
              <option value="sheet:bitumen">Bitumendach</option>
              <option value="sheet:wellblech">Wellblech (≥ 0,7 mm)</option>
              <option value="sheet:trapezblech">Trapezblech (≥ 0,7 mm)</option>
            </select>
          </label>
          <b>Modus:</b> {mode==="polygon"?"Polygon setzen (1=Traufe links, 2=Traufe rechts, 3=Ortgang oben rechts, 4=oben links)":
                          mode==="frame"?"Raster-Rahmen bearbeiten":"Module bearbeiten"}
        </div>

        {/* Eingaben für Maßstab */}
        {cover.kind==="tile" ? (
          <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <label>Ziegel <b>Traufe</b> (Anzahl):
              <input type="number" min={1} value={countTraufe} onChange={(e)=>setCountTraufe(e.target.value)} style={{width:100, marginLeft:6}}/>
            </label>
            <label>Ziegel <b>Ortgang</b> (Anzahl):
              <input type="number" min={1} value={countOrtgang} onChange={(e)=>setCountOrtgang(e.target.value)} style={{width:100, marginLeft:6}}/>
            </label>
          </div>
        ) : (
          <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <label>Länge <b>Traufe</b> (m):
              <input type="number" step="0.01" value={lenTraufeM} onChange={(e)=>setLenTraufeM(e.target.value)} style={{width:120, marginLeft:6}}/>
            </label>
            <label>Länge <b>Ortgang</b> (m):
              <input type="number" step="0.01" value={lenOrtgangM} onChange={(e)=>setLenOrtgangM(e.target.value)} style={{width:120, marginLeft:6}}/>
            </label>
          </div>
        )}

        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          {/* Beim Schließen jetzt Auto: Maßstab & Module */}
          <button
            onClick={()=>{
              if (points.length<3){ alert("Bitte zuerst das Polygon zeichnen."); return; }
              const willClose = !closed;
              setClosed(willClose);
              if (willClose){
                const mpp = computeMPPFromPolygon();
                if (!mpp){ alert("Maßstab: bitte Ziegelanzahlen / Längen eintragen."); return; }
                setMetersPerPixel(mpp);
                const fr = buildFrameFromPolygon();
                if (!fr){ alert("Polygon benötigt 4 Punkte in Reihenfolge 1-2-3-4."); return; }
                // Module direkt einzeichnen mit frischem MPP & Frame
                placeModulesPerspective(mpp, fr);
              }
            }}
            disabled={points.length<3}>
            {closed? "Polygon öffnen" : "Polygon schließen"}
          </button>

          <button onClick={()=>setMode("polygon")}>Polygon setzen</button>
          <button onClick={()=>setPoints(p=>p.slice(0,-1))} disabled={points.length===0 || closed}>Letzten Punkt löschen</button>
          <button onClick={()=>{ setPoints([]); setClosed(false); setModulesUV([]); setFrame(null); }}>Fläche zurücksetzen</button>
        </div>

        {/* Modulraster */}
        <div style={{borderTop:"1px solid #e5e7eb", paddingTop:8, display:"grid", gap:8}}>
          <div style={{fontWeight:600}}>Modulraster (Start: First & linker Ortgang, Rand 35 cm)</div>

          <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            <label>Breite (mm):
              <input type="number" value={moduleWmm} onChange={(e)=>setModuleWmm(parseInt(e.target.value||"0",10))} style={{width:100, marginLeft:6}}/>
            </label>
            <label>Höhe (mm):
              <input type="number" value={moduleHmm} onChange={(e)=>setModuleHmm(parseInt(e.target.value||"0",10))} style={{width:100, marginLeft:6}}/>
            </label>
            <label>Ausrichtung:
              <select value={orientation} onChange={(e)=>setOrientation(e.target.value as any)} style={{marginLeft:6}}>
                <option value="vertikal">vertikal</option>
                <option value="horizontal">horizontal</option>
              </select>
            </label>
            <label>Stil:
              <select value={moduleStyle} onChange={(e)=>setModuleStyle(e.target.value as any)} style={{marginLeft:6}}>
                <option value="fullblack">Full-Black</option>
                <option value="vertex">Vertex (Kontur + Diamant)</option>
              </select>
            </label>
            <label style={{display:"flex", alignItems:"center", gap:6}}>
              Transparenz
              <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e)=>setOpacity(parseFloat(e.target.value))}/>
            </label>
          </div>

          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            <button onClick={()=>placeModulesPerspective()}>Module einzeichnen</button>
            <button onClick={()=>setMode("modules")} disabled={modulesUV.length===0}>Module bearbeiten</button>
            <button onClick={()=>setMode("frame")} disabled={!frame}>Rahmen bearbeiten</button>
            <button onClick={clearModules} disabled={modulesUV.length===0}>Module löschen</button>
          </div>

          {metersPerPixel
            ? <b>Maßstab: {metersPerPixel.toFixed(5)} m/px {closed && points.length>=3 && <> • Fläche: {(polygonAreaPx2(points)*metersPerPixel*metersPerPixel).toFixed(2)} m²</>}</b>
            : <span>Maßstab wird beim „Polygon schließen“ automatisch berechnet (sofern Werte gesetzt).</span>}
        </div>
      </div>

      {/* Bild + Overlay */}
      {image && (
        <div style={{marginTop:12, position:"relative", display:"inline-block"}}
             onMouseMove={onMouseMoveOverlay} onMouseUp={onMouseUpOverlay} onMouseLeave={onMouseUpOverlay}>
          <img ref={imgRef} src={image} alt="Dach" style={{maxWidth:"100%", display:"block", cursor:"crosshair"}} onClick={onImgClick}/>

          <svg style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none"}}>
            <defs>
              <pattern id="mod-fullblack" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="100" height="100" fill="#0b0b0b"/>
                <path d="M0 50 H100 M50 0 V100" stroke="#111" strokeWidth="2"/>
                <rect x="0" y="0" width="100" height="100" fill="none" stroke="#161616" strokeWidth="4"/>
              </pattern>
            </defs>

            {/* Module */}
            {frame && modulesUV.map(m=>{
              if (m.removed) return null;
              const poly=uvRectToPolyPx(m,frame);
              const pts=poly.map(p=>`${p.x},${p.y}`).join(" ");
              if (moduleStyle==="fullblack"){
                return <polygon key={m.id} points={pts} fill="url(#mod-fullblack)" opacity={opacity} stroke="#111" strokeWidth={0.6}/>;
              } else {
                const cx=(poly[0].x+poly[2].x)/2, cy=(poly[0].y+poly[2].y)/2;
                const d=Math.max(6, 0.02*pxPerM);
                return (
                  <g key={m.id} opacity={opacity}>
                    <polygon points={pts} fill="none" stroke="#0e7490" strokeWidth={1.2}/>
                    <polygon points={`${cx},${cy-d} ${cx+d},${cy} ${cx},${cy+d} ${cx-d},${cy}`} fill="#0ea5b7" stroke="#0b7285" strokeWidth={0.8}/>
                  </g>
                );
              }
            })}

            {/* Polygon */}
            {!closed && points.map((p,i)=> points[i+1]
              ? <line key={`l-${i}`} x1={p.x} y1={p.y} x2={points[i+1].x} y2={points[i+1].y} stroke="red" strokeWidth={2}/>
              : null)}
            {closed && points.length>=3 && (
              <polygon points={points.map(p=>`${p.x},${p.y}`).join(" ")} fill="rgba(255,0,0,0.15)" stroke="red" strokeWidth={2}/>
            )}

            {/* Ziehbare Punkte */}
            {points.map((p,i)=>(
              <circle key={`p-${i}`} cx={p.x} cy={p.y} r={6}
                      fill={i===dragIndex?"#d00":"red"}
                      style={{cursor:"grab", pointerEvents:"auto"}}
                      onMouseDown={(e)=>{e.preventDefault(); setDragIndex(i);}}/>
            ))}

            {/* Rahmen sichtbar + dragbar */}
            {frame && (
              <>
                {[0,1,2,3].map(i=>{
                  const a=frame[i], b=frame[(i+1)%4];
                  return <line key={`f-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffbf00" strokeWidth={2} strokeDasharray="6 4"/>;
                })}
                {frame.map((p,i)=>(
                  <rect key={`fc-${i}`} x={p.x-6} y={p.y-6} width={12} height={12}
                        fill="#ffbf00" stroke="#7c5a00" strokeWidth={1}
                        style={{pointerEvents:"auto", cursor:"grab"}}
                        onMouseDown={(e)=>{e.preventDefault(); setMode("frame"); setFrameDrag({type:"corner", idx:i});}}/>
                ))}
                <polygon points={frame.map(p=>`${p.x},${p.y}`).join(" ")} fill="transparent"
                         style={{pointerEvents:"auto", cursor:"move"}}
                         onMouseDown={(e)=>{e.preventDefault(); setMode("frame"); setFrameDrag({type:"move"});}}/>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
