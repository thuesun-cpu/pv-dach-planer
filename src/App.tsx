import React, { useEffect, useRef, useState } from "react";

/** ---------- Typen ---------- */
type Pt = { x: number; y: number };
type ModuleUV = { id: string; u0: number; v0: number; u1: number; v1: number; removed?: boolean };
type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

/** ---------- Konstanten ---------- */
const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33 },
  doppelfalz_beton: { w_cm: 30,  h_cm: 33 },
  tonstein:         { w_cm: 30,  h_cm: 33 },
  jumbo:            { w_cm: 34,  h_cm: 36 },
} as const;

const EDGE_M  = 0.35;   // 35 cm Mindestabstand (Außenkante → Modulaußenkante)
const GAP_M   = 0.02;   // 2 cm Fuge
const SHRINK  = 0.965;  // 3,5 % optische Verkleinerung (Darstellung)
const EPS     = 1e-9;

/** ---------- Geometrie ---------- */
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const areaPx2 = (poly: Pt[]) => {
  if (poly.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
};
const pip = (x:number,y:number, poly:Pt[])=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    const hit=((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if(hit) inside=!inside;
  }
  return inside;
};
const dPointSeg = (px:number,py:number,x1:number,y1:number,x2:number,y2:number)=>{
  const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1;
  const dot=A*C+B*D, len=C*C+D*D;
  const t=Math.max(0,Math.min(1,len?dot/len:0));
  const xx=x1+t*C, yy=y1+t*D;
  return Math.hypot(px-xx,py-yy);
};
const minDistToEdges = (p:Pt, poly:Pt[])=>{
  let m=Infinity;
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    m=Math.min(m, dPointSeg(p.x,p.y,a.x,a.y,b.x,b.y));
  }
  return m;
};
const samplesOn = (poly:Pt[])=>{
  const [tl,tr,br,bl]=poly;
  const mid=(a:Pt,b:Pt)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  return [tl,tr,br,bl, mid(tl,tr), mid(tr,br), mid(br,bl), mid(bl,tl)];
};

/** ---------- Komponente ---------- */
export default function PVDachPlaner() {
  const [image, setImage] = useState<string|null>(null);

  // Polygon: 1=Traufe links (BL), 2=Traufe rechts (BR), 3=Ortgang oben rechts (TR), 4=oben links (TL, optional)
  const [pts, setPts] = useState<Pt[]>([]);
  const [drag, setDrag] = useState<number|null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Maßstab
  const [cover, setCover] = useState<RoofCover>({ kind:"tile", variant:"doppelfalz_beton" });
  const [cntTraufe,  setCntTraufe]  = useState("37");
  const [cntOrtgang, setCntOrtgang] = useState("21");
  const [lenTraufeM, setLenTraufeM] = useState("");
  const [lenOrtgangM,setLenOrtgangM]= useState("");
  const [mpp, setMpp] = useState<number|null>(null);

  // Module
  const [moduleWmm, setModuleWmm] = useState(1134);      // vertikal: Breite
  const [moduleHmm, setModuleHmm] = useState(1765);      // vertikal: Höhe
  const [orientation, setOrientation] = useState<"vertikal"|"horizontal">("vertikal");
  const [moduleStyle, setModuleStyle] = useState<"full"|"vertex">("full");
  const [opacity, setOpacity] = useState(0.9);

  // Perspektiv-Rahmen [TL,TR,BR,BL]
  const [frame, setFrame] = useState<Pt[]|null>(null);

  // Module (UV-Rechtecke)
  const [mods, setMods] = useState<ModuleUV[]>([]);
  const [grid, setGrid] = useState<{nx:number;ny:number}|null>(null);
  const [mode, setMode] = useState<"polygon"|"modules">("polygon");

  const imgRef = useRef<HTMLImageElement|null>(null);

  /** Maus relativ zum Bild */
  const rel = (e:React.MouseEvent)=>{
    const r=imgRef.current?.getBoundingClientRect(); if(!r) return {x:0,y:0};
    return { x:Math.min(Math.max(e.clientX-r.left,0),r.width),
             y:Math.min(Math.max(e.clientY-r.top ,0),r.height) };
  };

  /** Klick auf Bild */
  const onImgClick = (e:React.MouseEvent<HTMLImageElement>)=>{
    const p=rel(e);
    if(mode==="modules" && frame){
      // Einzelnes Modul toggeln
      for(let i=mods.length-1;i>=0;i--){
        const poly = uvRectToPoly(mods[i], frame);
        if(pip(p.x,p.y,poly)){
          setMods(prev=>{ const cp=[...prev]; cp[i]={...cp[i], removed:!cp[i].removed}; return cp; });
          return;
        }
      }
      return;
    }
    if(!closed){
      setPts(prev=>[...prev, p]);
    }
  };

  /** Drag Punkte */
  const onMove = (e:React.MouseEvent)=>{
    if(drag!==null){
      const p=rel(e);
      setPts(prev=>{ const cp=[...prev]; cp[drag]=p; return cp; });
    }
  };

  /** Maßstab (aus aktuellem Polygon) */
  const computeMPP = (poly:Pt[]): number|null => {
    if(poly.length<3) return null;
    const [p1,p2,p3] = [poly[0],poly[1],poly[2]]; // BL, BR, TR
    const pxTraufe  = dist(p1,p2);
    const pxOrtgang = dist(p2,p3);
    const arr:number[]=[];
    if(cover.kind==="tile"){
      const spec = TILE_SPECS_CM[(cover as any).variant];
      const cT = parseFloat((cntTraufe||"").replace(",","."));
      const cO = parseFloat((cntOrtgang||"").replace(",","."));
      if(isFinite(cT)&&cT>0 && pxTraufe>0)  arr.push((cT*spec.h_cm/100)/pxTraufe);
      if(isFinite(cO)&&cO>0 && pxOrtgang>0) arr.push((cO*spec.w_cm/100)/pxOrtgang);
    } else {
      const mT = parseFloat((lenTraufeM||"").replace(",","."));
      const mO = parseFloat((lenOrtgangM||"").replace(",","."));
      if(isFinite(mT)&&mT>0 && pxTraufe>0)  arr.push(mT/pxTraufe);
      if(isFinite(mO)&&mO>0 && pxOrtgang>0) arr.push(mO/pxOrtgang);
    }
    if(arr.length===0) return null;
    return arr.reduce((a,b)=>a+b,0)/arr.length;
  };

  /** Rahmen aus 3 oder 4 Punkten: Rückgabe [TL,TR,BR,BL] */
  const buildFrame = (poly:Pt[]): Pt[] | null => {
    if(poly.length<3) return null;
    const p1=poly[0], p2=poly[1], p3=poly[2];   // BL, BR, TR
    const p4=poly.length>=4 ? poly[3] : { x:p1.x+(p3.x-p2.x), y:p1.y+(p3.y-p2.y) }; // TL konstruiert
    return [p4, p3, p2, p1];
  };

  /** Bilinear-Map & Polygon aus UV */
  const mapUV = (u:number,v:number, fr:Pt[])=>{
    const [tl,tr,br,bl]=fr;
    return {
      x:(1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x,
      y:(1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y,
    };
  };
  const uvRectToPoly = (m:ModuleUV, fr:Pt[])=>{
    const pTL=mapUV(m.u0,m.v0,fr), pTR=mapUV(m.u1,m.v0,fr),
          pBR=mapUV(m.u1,m.v1,fr), pBL=mapUV(m.u0,m.v1,fr);
    return [pTL,pTR,pBR,pBL];
  };

  /** Module packen – robust, startet First & linker Ortgang */
  const placeModules = (mppLocal:number, fr:Pt[])=>{
    const topM  = dist(fr[0],fr[1]) * mppLocal; // First-Länge
    const leftM = dist(fr[0],fr[3]) * mppLocal; // linker Ortgang

    // reale Modulmaße für PACKEN
    const Wm = moduleWmm/1000, Hm = moduleHmm/1000;
    const modW = orientation==="vertikal" ? Wm : Hm;
    const modH = orientation==="vertikal" ? Hm : Wm;

    const stopU = topM  - EDGE_M; // Innenkante rechts
    const stopV = leftM - EDGE_M; // Innenkante unten

    const out:ModuleUV[]=[];
    let nx=0, ny=0, id=0;
    let v = EDGE_M;

    while (v + modH <= stopV + EPS) {
      let u = EDGE_M;
      let rowCount = 0;
      while (u + modW <= stopU + EPS) {
        // reale Zelle (UV)
        const u0r=u/topM, v0r=v/leftM, u1r=(u+modW)/topM, v1r=(v+modH)/leftM;
        // Darstellung 3,5% kleiner – zentriert
        const uc=(u0r+u1r)/2, vc=(v0r+v1r)/2;
        const hu=(u1r-u0r)/2*SHRINK, hv=(v1r-v0r)/2*SHRINK;
        const u0=uc-hu, u1=uc+hu, v0=vc-hv, v1=vc+hv;

        const poly=[ mapUV(u0,v0,fr), mapUV(u1,v0,fr), mapUV(u1,v1,fr), mapUV(u0,v1,fr) ];
        const okInside = samplesOn(poly).every(s=>pip(s.x,s.y,pts));
        const okMargin = samplesOn(poly).every(s=>(minDistToEdges(s,pts)*mppLocal)>=EDGE_M-1e-6);
        if(!okInside || !okMargin) break;

        out.push({ id:String(id++), u0,v0,u1,v1 });
        rowCount++;
        u += modW + GAP_M;
      }
      if(rowCount===0) break;
      if(nx===0) nx=rowCount;
      ny++;
      v += modH + GAP_M;
    }

    setMods(out);
    setGrid({nx,ny});
    setMode("modules");
  };

  /** Polygon schließen → direkt alles ausführen (ohne Popups, ohne disabled) */
  const handleClose = ()=>{
    if (pts.length < 3) return;

    // ggf. Zustand zurücksetzen, falls bereits geschlossen war
    if (closed) {
      setClosed(false);
      setMpp(null);
      setFrame(null);
      setMods([]);
      setGrid(null);
    }

    // Sofort berechnen (lokal) & gleich zeichnen
    const mLocal = computeMPP(pts);
    const fLocal = buildFrame(pts);
    if (!mLocal || !fLocal) { return; }

    // States für Anzeige setzen …
    setClosed(true);
    setMpp(mLocal);
    setFrame(fLocal);

    // … und sofort zeichnen (ohne auf State zu warten)
    placeModules(mLocal, fLocal);
  };

  /** Bei Änderungen an Modulmaßen / Orientation neu packen, falls Maße da */
  useEffect(()=>{
    if (closed && mpp && frame) {
      placeModules(mpp, frame);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleWmm, moduleHmm, orientation]);

  /** Reset */
  const resetAll = ()=>{
    setPts([]); setDrag(null); setClosed(false);
    setMpp(null); setFrame(null); setMods([]); setGrid(null); setMode("polygon");
  };

  const pxPerM = mpp ? 1/mpp : 0;

  return (
    <div>
      {/* Upload */}
      <input
        type="file"
        accept="image/*"
        onChange={(e)=>{
          const f=e.target.files?.[0]; if(!f) return;
          const r=new FileReader();
          r.onload=()=>{ setImage(r.result as string); resetAll(); };
          r.readAsDataURL(f);
        }}
      />

      {/* Steuerleiste */}
      <div style={{marginTop:10, display:"grid", gap:8}}>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <label>Dachhaut:&nbsp;
            <select
              value={cover.kind==="tile"?`t:${(cover as any).variant}`:`s:${(cover as any).variant}`}
              onChange={(e)=>{
                const [k,v]=e.target.value.split(":");
                setCover(k==="t"?{kind:"tile",variant:v as any}:{kind:"sheet",variant:v as any});
                setMpp(null);
              }}>
              <option value="t:einfalz">Einfalzziegel 21,5×33 cm</option>
              <option value="t:doppelfalz_beton">Doppelfalzziegel / Beton 30×33 cm</option>
              <option value="t:tonstein">Tonstein 30×33 cm</option>
              <option value="t:jumbo">Jumboziegel 34×36 cm</option>
              <option value="s:bitumen">Bitumendach</option>
              <option value="s:wellblech">Wellblech (≥ 0,7 mm)</option>
              <option value="s:trapezblech">Trapezblech (≥ 0,7 mm)</option>
            </select>
          </label>
          <b>Modus:</b> {mode==="polygon" ? "Polygon setzen" : "Module bearbeiten"}
        </div>

        {/* Eingaben für Maßstab */}
        {cover.kind==="tile" ? (
          <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <label>Ziegel <b>Traufe</b> (Anzahl):
              <input style={{width:90, marginLeft:6}} value={cntTraufe} onChange={e=>setCntTraufe(e.target.value)} />
            </label>
            <label>Ziegel <b>Ortgang</b> (Anzahl):
              <input style={{width:90, marginLeft:6}} value={cntOrtgang} onChange={e=>setCntOrtgang(e.target.value)} />
            </label>
          </div>
        ) : (
          <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <label>Länge <b>Traufe</b> (m):
              <input style={{width:110, marginLeft:6}} value={lenTraufeM} onChange={e=>setLenTraufeM(e.target.value)} />
            </label>
            <label>Länge <b>Ortgang</b> (m):
              <input style={{width:110, marginLeft:6}} value={lenOrtgangM} onChange={e=>setLenOrtgangM(e.target.value)} />
            </label>
          </div>
        )}

        {/* Aktionen */}
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button onClick={handleClose}>
            {closed ? "Polygon erneut schließen" : "Polygon schließen"}
          </button>
          <button onClick={()=>{ setClosed(false); setMpp(null); setFrame(null); setMods([]); setGrid(null); setMode("polygon"); }}>
            Polygon öffnen
          </button>
          <button onClick={()=>setPts(p=>p.slice(0,-1))} disabled={pts.length===0}>Letzten Punkt löschen</button>
          <button onClick={resetAll}>Fläche zurücksetzen</button>
        </div>

        {/* Modulraster */}
        <div style={{borderTop:"1px solid #e5e7eb", paddingTop:8, display:"grid", gap:8}}>
          <div style={{fontWeight:600}}>
            Modulraster (Start: First & linker Ortgang, Rand 35 cm){grid?` • Module: ${grid.nx} × ${grid.ny}`:""}
          </div>

          <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            <label>Breite (mm):
              <input style={{width:90, marginLeft:6}} type="number" value={moduleWmm} onChange={e=>setModuleWmm(parseInt(e.target.value||"0",10))}/>
            </label>
            <label>Höhe (mm):
              <input style={{width:90, marginLeft:6}} type="number" value={moduleHmm} onChange={e=>setModuleHmm(parseInt(e.target.value||"0",10))}/>
            </label>
            <label>Ausrichtung:
              <select style={{marginLeft:6}} value={orientation} onChange={e=>setOrientation(e.target.value as any)}>
                <option value="vertikal">vertikal</option>
                <option value="horizontal">horizontal</option>
              </select>
            </label>
            <label>Stil:
              <select style={{marginLeft:6}} value={moduleStyle} onChange={e=>setModuleStyle(e.target.value as any)}>
                <option value="full">Full-Black</option>
                <option value="vertex">Vertex</option>
              </select>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6}}>
              Transparenz <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={e=>setOpacity(parseFloat(e.target.value))}/>
            </label>
            <button onClick={()=>{ if(frame && mpp) placeModules(mpp, frame); }}>Module einzeichnen</button>
            <button onClick={()=>setMods([])} disabled={!mods.length}>Module löschen</button>
          </div>

          {mpp
            ? <b>Maßstab: {mpp.toFixed(5)} m/px {closed && pts.length>=3 && <> • Fläche: {(areaPx2(pts)*mpp*mpp).toFixed(2)} m²</>}</b>
            : <span><i>Hinweis:</i> Beim „Polygon schließen“ wird Maßstab & Modulraster automatisch gesetzt. Wenn hier nichts steht, fehlen oben Eingabewerte (Ziegel-/Längenwerte).</span>}
        </div>
      </div>

      {/* Bild + Overlay */}
      {image && (
        <div style={{marginTop:12, position:"relative", display:"inline-block"}} onMouseMove={onMove} onMouseUp={()=>setDrag(null)} onMouseLeave={()=>setDrag(null)}>
          <img ref={imgRef} src={image} alt="Dach" style={{maxWidth:"100%", display:"block", cursor:"crosshair"}} onClick={onImgClick}/>
          <svg style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none"}}>
            <defs>
              <pattern id="fullb" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="100" height="100" fill="#0b0b0b"/>
                <path d="M0 50 H100 M50 0 V100" stroke="#111" strokeWidth="2"/>
                <rect x="0" y="0" width="100" height="100" fill="none" stroke="#161616" strokeWidth="4"/>
              </pattern>
            </defs>

            {/* Module */}
            {frame && mods.map(m=>{
              if(m.removed) return null;
              const poly=uvRectToPoly(m,frame);
              const ptsS=poly.map(p=>`${p.x},${p.y}`).join(" ");
              return moduleStyle==="full"
                ? <polygon key={m.id} points={ptsS} fill="url(#fullb)" opacity={opacity} stroke="#111" strokeWidth={0.6}/>
                : (()=>{ const cx=(poly[0].x+poly[2].x)/2, cy=(poly[0].y+poly[2].y)/2, d=8;
                         return <g key={m.id} opacity={opacity}>
                           <polygon points={ptsS} fill="none" stroke="#0e7490" strokeWidth={1.2}/>
                           <polygon points={`${cx},${cy-d} ${cx+d},${cy} ${cx},${cy+d} ${cx-d},${cy}`} fill="#0ea5b7" stroke="#0b7285" strokeWidth={0.8}/>
                         </g>; })();
            })}

            {/* Polygon */}
            {!closed && pts.map((p,i)=> pts[i+1] ? <line key={i} x1={p.x} y1={p.y} x2={pts[i+1].x} y2={pts[i+1].y} stroke="red" strokeWidth={2}/> : null)}
            {closed && pts.length>=3 && (<polygon points={pts.map(p=>`${p.x},${p.y}`).join(" ")} fill="rgba(255,0,0,0.15)" stroke="red" strokeWidth={2}/>)}

            {/* Griffe */}
            {pts.map((p,i)=>(
              <circle key={`p-${i}`} cx={p.x} cy={p.y} r={6}
                      style={{pointerEvents:"auto",cursor:"grab"}} fill="red"
                      onMouseDown={(e)=>{e.preventDefault(); setDrag(i);}}/>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
