import React, { useRef, useState } from "react";

type Pt = { x: number; y: number };
type ModuleUV = { id: string; u0: number; v0: number; u1: number; v1: number; removed?: boolean };
type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33 },
  doppelfalz_beton: { w_cm: 30,  h_cm: 33 },
  tonstein:         { w_cm: 30,  h_cm: 33 },
  jumbo:            { w_cm: 34,  h_cm: 36 },
} as const;

const EDGE_M  = 0.35;  // 35 cm Mindestabstand bis Außenkante
const GAP_M   = 0.02;  // 2 cm Fuge
const SHRINK  = 0.965; // 3,5 % optisch kleiner zeichnen
const EPS     = 1e-9;

/* ---------- Geometrie-Helfer ---------- */
const dist = (a: Pt, b: Pt) => Math.hypot(a.x-b.x, a.y-b.y);
const areaPx2 = (poly: Pt[]) => {
  let s=0; for (let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length]; s+=p.x*q.y-q.x*p.y;}
  return Math.abs(s)/2;
};
const pip = (x:number,y:number, poly:Pt[]) => {
  let inside=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    const hit=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);
    if(hit) inside=!inside;
  }
  return inside;
};
const dPointSeg = (px:number,py:number,x1:number,y1:number,x2:number,y2:number)=>{
  const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1; const dot=A*C+B*D, len=C*C+D*D;
  const t=Math.max(0,Math.min(1,len?dot/len:0)); const xx=x1+t*C,yy=y1+t*D;
  return Math.hypot(px-xx,py-yy);
};
const minDistToEdges = (p:Pt, poly:Pt[])=>{
  let m=Infinity;
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    m=Math.min(m,dPointSeg(p.x,p.y,a.x,a.y,b.x,b.y));
  }
  return m;
};
const samplesOn = (poly:Pt[])=>{
  const [tl,tr,br,bl]=poly, mid=(a:Pt,b:Pt)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  return [tl,tr,br,bl, mid(tl,tr),mid(tr,br),mid(br,bl),mid(bl,tl)];
};

export default function PVDachPlaner(){
  const [img, setImg] = useState<string|null>(null);

  // Polygon: P1=Traufe links, P2=Traufe rechts, P3=Ortgang oben rechts, P4=oben links
  const [pts, setPts] = useState<Pt[]>([]);
  const [drag, setDrag] = useState<number|null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Maßstab
  const [cover, setCover] = useState<RoofCover>({kind:"tile", variant:"doppelfalz_beton"});
  const [cntTraufe, setCntT] = useState("37");
  const [cntOrtgang,setCntO] = useState("21");
  const [lenTraufe,setLenT]  = useState("");
  const [lenOrtgang,setLenO] = useState("");
  const [mpp, setMpp]        = useState<number|null>(null);

  // Module
  const [wmm,setWmm] = useState(1134);
  const [hmm,setHmm] = useState(1765);
  const [orient,setOrient] = useState<"vertikal"|"horizontal">("vertikal");
  const [style,setStyle]   = useState<"full"|"vertex">("full");
  const [alpha,setAlpha]   = useState(0.9);

  // Perspektiv-Rahmen [TL,TR,BR,BL]
  const [frame,setFrame] = useState<Pt[]|null>(null);
  const [frameDrag,setFrameDrag] = useState<{type:"move"|"corner";idx?:number}|null>(null);

  // Module (UV-Rechtecke)
  const [mods,setMods] = useState<ModuleUV[]>([]);
  const [grid,setGrid] = useState<{nx:number;ny:number}|null>(null);
  const [mode,setMode] = useState<"polygon"|"frame"|"modules">("polygon");

  const imgRef = useRef<HTMLImageElement|null>(null);
  const rel = (e:React.MouseEvent)=>{
    const r=imgRef.current?.getBoundingClientRect(); if(!r) return {x:0,y:0};
    return { x:Math.min(Math.max(e.clientX-r.left,0),r.width),
             y:Math.min(Math.max(e.clientY-r.top ,0),r.height) };
  };

  const onImgClick=(e:React.MouseEvent<HTMLImageElement>)=>{
    const p=rel(e);
    if(mode==="modules" && frame){
      for(let i=mods.length-1;i>=0;i--){
        const poly=uvRectToPoly(mods[i],frame);
        if(pip(p.x,p.y,poly)){
          setMods(prev=>{const cp=[...prev]; cp[i]={...cp[i],removed:!cp[i].removed}; return cp;});
          return;
        }
      }
      return;
    }
    if(!closed) setPts(prev=>[...prev,p]);
  };

  const onMove=(e:React.MouseEvent)=>{
    if(drag!==null){
      const p=rel(e); setPts(prev=>{const cp=[...prev]; cp[drag]=p; return cp;});
    }
    if(frame && frameDrag){
      if(frameDrag.type==="corner" && frameDrag.idx!==undefined){
        const p=rel(e); setFrame(prev=>{ if(!prev) return prev; const cp=[...prev]; cp[frameDrag.idx]=p; return cp;});
      }else if(frameDrag.type==="move"){
        const dx=(e as any).movementX??0, dy=(e as any).movementY??0;
        setFrame(prev=>prev?.map(q=>({x:q.x+dx,y:q.y+dy}))??prev);
      }
    }
  };
  const onUp=()=>{ setDrag(null); setFrameDrag(null); };

  /* ----- Maßstab aus P1→P2 (Traufe) & P2→P3 (Ortgang) ----- */
  const computeMPP=():number|null=>{
    if(pts.length<3) return null;
    const [p1,p2,p3]=[pts[0],pts[1],pts[2]];
    const pxT=dist(p1,p2), pxO=dist(p2,p3);
    const arr:number[]=[];
    if(cover.kind==="tile"){
      const spec=TILE_SPECS_CM[(cover as any).variant];
      const cT=parseFloat(cntTraufe.replace(",","."));
      const cO=parseFloat(cntOrtgang.replace(",","."));
      if(isFinite(cT)&&cT>0 && pxT>0) arr.push((cT*spec.h_cm/100)/pxT);
      if(isFinite(cO)&&cO>0 && pxO>0) arr.push((cO*spec.w_cm/100)/pxO);
    }else{
      const mT=parseFloat(lenTraufe.replace(",","."));
      const mO=parseFloat(lenOrtgang.replace(",","."));
      if(isFinite(mT)&&mT>0 && pxT>0) arr.push(mT/pxT);
      if(isFinite(mO)&&mO>0 && pxO>0) arr.push(mO/pxO);
    }
    if(arr.length===0) return null;
    return arr.reduce((a,b)=>a+b,0)/arr.length;
  };

  /* ----- Frame aus Polygon → [TL,TR,BR,BL] ----- */
  const buildFrame=():Pt[]|null=>{
    if(pts.length<4) return null;
    const p1=pts[0], p2=pts[1], p3=pts[2], p4=pts[3];
    return [p4,p3,p2,p1]; // TL,TR,BR,BL
  };

  /* ----- Bilinear ----- */
  const mapUV=(u:number,v:number, fr:Pt[])=>{
    const [tl,tr,br,bl]=fr;
    return {
      x:(1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x,
      y:(1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y,
    };
  };
  const uvRectToPoly=(m:ModuleUV, fr:Pt[])=>{
    const pTL=mapUV(m.u0,m.v0,fr), pTR=mapUV(m.u1,m.v0,fr),
          pBR=mapUV(m.u1,m.v1,fr), pBL=mapUV(m.u0,m.v1,fr);
    return [pTL,pTR,pBR,pBL];
  };

  /* ----- Module packen: robuste Schleife (kein Floor) ----- */
  const placeModules=(mppLocal:number, fr:Pt[])=>{
    const topM  = dist(fr[0],fr[1]) * mppLocal; // First-Länge
    const leftM = dist(fr[0],fr[3]) * mppLocal; // linker Ortgang

    // reale Maße für PACKEN
    const Wm = wmm/1000, Hm = hmm/1000;
    const modW = orient==="vertikal" ? Wm : Hm;
    const modH = orient==="vertikal" ? Hm : Wm;

    const Umax = topM  - EDGE_M; // rechte „Stopkante“ (innen)
    const Vmax = leftM - EDGE_M; // untere  „Stopkante“ (innen)

    const out: ModuleUV[] = [];
    let nx=0, ny=0, id=0;

    // y ab First nach unten, x ab linkem Ortgang nach rechts
    let v = EDGE_M;
    while (v + modH <= Vmax + EPS) {
      let u = EDGE_M;
      let rowCount = 0;
      while (u + modW <= Umax + EPS) {
        // reale UV-Box
        const u0r = u / topM, v0r = v / leftM;
        const u1r = (u+modW) / topM, v1r = (v+modH) / leftM;

        // optisches Shrink in der Zellenmitte
        const uc=(u0r+u1r)/2, vc=(v0r+v1r)/2;
        const hu=(u1r-u0r)/2 * SHRINK, hv=(v1r-v0r)/2 * SHRINK;
        const u0=uc-hu, u1=uc+hu, v0=vc-hv, v1=vc+hv;

        const poly=[ mapUV(u0,v0,fr), mapUV(u1,v0,fr), mapUV(u1,v1,fr), mapUV(u0,v1,fr) ];

        const okInside = samplesOn(poly).every(s => pip(s.x,s.y,pts));
        const okMargin = samplesOn(poly).every(s => (minDistToEdges(s,pts)*mppLocal) >= EDGE_M - 1e-6);

        if (okInside && okMargin) {
          out.push({id:String(id++), u0,v0,u1,v1});
          u += modW + GAP_M;
          rowCount++;
        } else {
          break; // nächste rechts würde bereits ausfallen → Zeile beenden
        }
      }
      if (rowCount===0) break;
      if (nx===0) nx=rowCount; // erste Zeile bestimmt Spaltenzahl
      ny++;
      v += modH + GAP_M;
    }

    setFrame(fr);
    setMods(out);
    setGrid({nx,ny});
    setMode("modules");
  };

  /* ----- Reset ----- */
  const resetAll=()=>{ setPts([]); setClosed(false); setMpp(null); setMods([]); setFrame(null); setGrid(null); setMode("polygon"); };

  /* ---------- UI ---------- */
  const pxPerM = mpp ? 1/mpp : 0;

  return (
    <div>
      <input type="file" accept="image/*" onChange={(e)=>{
        const f=e.target.files?.[0]; if(!f) return;
        const r=new FileReader();
        r.onload=()=>{ setImg(r.result as string); resetAll(); };
        r.readAsDataURL(f);
      }}/>

      <div style={{marginTop:10, display:"grid", gap:8}}>
        <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
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
              <option value="s:wellblech">Wellblech (≥0,7 mm)</option>
              <option value="s:trapezblech">Trapezblech (≥0,7 mm)</option>
            </select>
          </label>
          <b>Modus:</b> {mode==="polygon"?"Polygon setzen":mode==="frame"?"Rahmen bearbeiten":"Module bearbeiten"}
        </div>

        {cover.kind==="tile" ? (
          <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <label>Ziegel Traufe:
              <input style={{width:80, marginLeft:6}} value={cntTraufe} onChange={e=>setCntT(e.target.value)} />
            </label>
            <label>Ziegel Ortgang:
              <input style={{width:80, marginLeft:6}} value={cntOrtgang} onChange={e=>setCntO(e.target.value)} />
            </label>
          </div>
        ) : (
          <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <label>Länge Traufe (m):
              <input style={{width:100, marginLeft:6}} value={lenTraufe} onChange={e=>setLenT(e.target.value)} />
            </label>
            <label>Länge Ortgang (m):
              <input style={{width:100, marginLeft:6}} value={lenOrtgang} onChange={e=>setLenO(e.target.value)} />
            </label>
          </div>
        )}

        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button
            onClick={()=>{
              if(pts.length<3) return;
              const willClose=!closed; setClosed(willClose);
              if(willClose){
                const m = computeMPP(); if(!m) return;
                setMpp(m);
                const fr = buildFrame(); if(!fr) return;
                // WICHTIG: direkt mit lokalen Werten packen (kein Warten auf setState)
                placeModules(m, fr);
              }
            }}
            disabled={pts.length<3}
          >
            {closed?"Polygon öffnen":"Polygon schließen"}
          </button>
          <button onClick={()=>setPts(p=>p.slice(0,-1))} disabled={closed||pts.length===0}>Letzten Punkt löschen</button>
          <button onClick={resetAll}>Fläche zurücksetzen</button>
        </div>

        <div style={{borderTop:"1px solid #e5e7eb", paddingTop:8}}>
          <div style={{fontWeight:600}}>
            Modulraster (Start: First & linker Ortgang, Rand 35 cm){grid?` • Module: ${grid.nx} × ${grid.ny}`:""}
          </div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            <label>Breite (mm): <input style={{width:90, marginLeft:6}} type="number" value={wmm} onChange={e=>setWmm(parseInt(e.target.value||"0",10))} /></label>
            <label>Höhe (mm):   <input style={{width:90, marginLeft:6}} type="number" value={hmm} onChange={e=>setHmm(parseInt(e.target.value||"0",10))} /></label>
            <label>Ausrichtung:
              <select style={{marginLeft:6}} value={orient} onChange={e=>setOrient(e.target.value as any)}>
                <option value="vertikal">vertikal</option>
                <option value="horizontal">horizontal</option>
              </select>
            </label>
            <label>Stil:
              <select style={{marginLeft:6}} value={style} onChange={e=>setStyle(e.target.value as any)}>
                <option value="full">Full-Black</option>
                <option value="vertex">Vertex</option>
              </select>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6}}>
              Transparenz <input type="range" min={0.2} max={1} step={0.05} value={alpha} onChange={e=>setAlpha(parseFloat(e.target.value))}/>
            </label>
            <button onClick={()=>{ if(frame&&mpp) placeModules(mpp, frame); }}>Module einzeichnen</button>
            <button onClick={()=>setMods([])} disabled={!mods.length}>Module löschen</button>
          </div>

          {mpp
            ? <b>Maßstab: {mpp.toFixed(5)} m/px {closed && pts.length>=3 && <> • Fläche: {(areaPx2(pts)*mpp*mpp).toFixed(2)} m²</>}</b>
            : <span>Beim „Polygon schließen“ wird Maßstab + Modulraster automatisch gesetzt.</span>}
        </div>
      </div>

      {img && (
        <div style={{marginTop:12, position:"relative", display:"inline-block"}} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          <img ref={imgRef} src={img} style={{maxWidth:"100%", display:"block", cursor:"crosshair"}} onClick={onImgClick}/>
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
              const poly=uvRectToPoly(m,frame), ptsS=poly.map(p=>`${p.x},${p.y}`).join(" ");
              return style==="full"
                ? <polygon key={m.id} points={ptsS} fill="url(#fullb)" opacity={alpha} stroke="#111" strokeWidth={0.6}/>
                : (()=>{ const cx=(poly[0].x+poly[2].x)/2, cy=(poly[0].y+poly[2].y)/2; const d=Math.max(6,0.02*(mpp?1/mpp:0));
                         return <g key={m.id} opacity={alpha}>
                           <polygon points={ptsS} fill="none" stroke="#0e7490" strokeWidth={1.2}/>
                           <polygon points={`${cx},${cy-d} ${cx+d},${cy} ${cx},${cy+d} ${cx-d},${cy}`} fill="#0ea5b7" stroke="#0b7285" strokeWidth={0.8}/>
                         </g>; })();
            })}

            {/* Polygon */}
            {!closed && pts.map((p,i)=>pts[i+1]?<line key={i} x1={p.x} y1={p.y} x2={pts[i+1].x} y2={pts[i+1].y} stroke="red" strokeWidth={2}/> : null)}
            {closed && pts.length>=3 && (<polygon points={pts.map(p=>`${p.x},${p.y}`).join(" ")} fill="rgba(255,0,0,0.15)" stroke="red" strokeWidth={2}/>)}

            {/* Griffe */}
            {pts.map((p,i)=>(<circle key={`p-${i}`} cx={p.x} cy={p.y} r={6} fill="red" style={{pointerEvents:"auto",cursor:"grab"}}
              onMouseDown={(e)=>{e.preventDefault(); setDrag(i);}}/>))}

            {/* Rahmen */}
            {frame && (
              <>
                {[0,1,2,3].map(i=>{const a=frame[i],b=frame[(i+1)%4];
                  return <line key={`f-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffbf00" strokeWidth={2} strokeDasharray="6 4"/>; })}
                {frame.map((p,i)=>(
                  <rect key={`fc-${i}`} x={p.x-6} y={p.y-6} width={12} height={12} fill="#ffbf00" stroke="#7c5a00" strokeWidth={1}
                        style={{pointerEvents:"auto",cursor:"grab"}}
                        onMouseDown={(e)=>{e.preventDefault(); setMode("frame"); setFrameDrag({type:"corner",idx:i});}}/>
                ))}
                <polygon points={frame.map(p=>`${p.x},${p.y}`).join(" ")} fill="transparent" style={{pointerEvents:"auto",cursor:"move"}}
                         onMouseDown={(e)=>{e.preventDefault(); setMode("frame"); setFrameDrag({type:"move"});}}/>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
