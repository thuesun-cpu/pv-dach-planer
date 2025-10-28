import React, { useEffect, useRef, useState } from "react";

/** --------- Typen --------- */
type Pt = { x: number; y: number };
type ModuleUV = { id: string; u0: number; v0: number; u1: number; v1: number; removed?: boolean };
type RoofCover =
  | { kind: "tile"; variant: "einfalz" | "doppelfalz_beton" | "tonstein" | "jumbo" }
  | { kind: "sheet"; variant: "bitumen" | "wellblech" | "trapezblech" };

/** --------- Konstanten --------- */
const TILE_SPECS_CM = {
  einfalz: { w_cm: 21.5, h_cm: 33 },
  doppelfalz_beton: { w_cm: 30,  h_cm: 33 },
  tonstein:         { w_cm: 30,  h_cm: 33 },
  jumbo:            { w_cm: 34,  h_cm: 36 },
} as const;

const EDGE_M = 0.35;  // 35 cm Außenkante → Modul-Außenkante
const GAP_M  = 0.02;  // 2 cm Modul-Fuge
const SHRINK = 0.965; // 3,5% optische Verkleinerung (darstellen)

/** --------- Geometrie --------- */
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const areaPx2 = (poly: Pt[]) => {
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

/** --------- Komponente --------- */
export default function PVDachPlaner() {
  const [img, setImg] = useState<string|null>(null);

  // Polygon: 1=Traufe links (BL), 2=Traufe rechts (BR), 3=Ortgang oben rechts (TR), 4=oben links (TL)
  const [pts, setPts] = useState<Pt[]>([]);
  const [drag, setDrag] = useState<number|null>(null);
  const [closed, setClosed] = useState(false);

  // Dachhaut & Maßstab
  const [cover, setCover] = useState<RoofCover>({kind:"tile",variant:"doppelfalz_beton"});
  const [cntT, setCntT] = useState("37");
  const [cntO, setCntO] = useState("21");
  const [lenT, setLenT] = useState("");
  const [lenO, setLenO] = useState("");
  const [mpp, setMpp]   = useState<number|null>(null);

  // Module
  const [wmm,setWmm] = useState(1134);
  const [hmm,setHmm] = useState(1765);
  const [orient,setOrient] = useState<"vertikal"|"horizontal">("vertikal");
  const [style,setStyle]   = useState<"full"|"vertex">("full");
  const [alpha,setAlpha]   = useState(0.9);

  // Perspektiv-Rahmen [TL,TR,BR,BL]
  const [frame, setFrame] = useState<Pt[]|null>(null);

  // Module (UV-Rechtecke)
  const [mods, setMods] = useState<ModuleUV[]>([]);
  const [grid, setGrid] = useState<{nx:number;ny:number}|null>(null);
  const [mode, setMode] = useState<"polygon"|"frame"|"modules">("polygon");

  const imgRef = useRef<HTMLImageElement|null>(null);

  const rel = (e:React.MouseEvent)=>{
    const r=imgRef.current?.getBoundingClientRect(); if(!r) return {x:0,y:0};
    return { x:Math.min(Math.max(e.clientX-r.left,0),r.width),
             y:Math.min(Math.max(e.clientY-r.top ,0),r.height) };
  };

  const onImgClick = (e:React.MouseEvent<HTMLImageElement>)=>{
    const p = rel(e);
    if(mode==="modules" && frame){
      for(let i=mods.length-1;i>=0;i--){
        const poly = uvRectToPoly(mods[i], frame);
        if(pip(p.x,p.y,poly)){
          setMods(prev=>{const cp=[...prev]; cp[i]={...cp[i],removed:!cp[i].removed}; return cp;});
          return;
        }
      }
      return;
    }
    if(!closed) setPts(prev=>[...prev,p]);
  };

  const onMove = (e:React.MouseEvent)=>{
    if(drag!==null){
      const p=rel(e);
      setPts(prev=>{const cp=[...prev]; cp[drag]=p; return cp;});
    }
  };

  /* ---------- Maßstab berechnen (unabhängig von State-Sequenz) ---------- */
  const computeMPP = (poly:Pt[]): number|null => {
    if(poly.length<3) return null;
    const [p1,p2,p3] = [poly[0],poly[1],poly[2]];
    const pxTraufe  = dist(p1,p2);
    const pxOrtgang = dist(p2,p3);
    const arr:number[]=[];
    if(cover.kind==="tile"){
      const spec = TILE_SPECS_CM[(cover as any).variant];
      const cT = parseFloat(cntT.replace(",","."));
      const cO = parseFloat(cntO.replace(",","."));
      if(isFinite(cT)&&cT>0 && pxTraufe>0)  arr.push((cT*spec.h_cm/100)/pxTraufe);
      if(isFinite(cO)&&cO>0 && pxOrtgang>0) arr.push((cO*spec.w_cm/100)/pxOrtgang);
    }else{
      const mT = parseFloat(lenT.replace(",","."));
      const mO = parseFloat(lenO.replace(",","."));
      if(isFinite(mT)&&mT>0 && pxTraufe>0)  arr.push(mT/pxTraufe);
      if(isFinite(mO)&&mO>0 && pxOrtgang>0) arr.push(mO/pxOrtgang);
    }
    if(arr.length===0) return null;
    return arr.reduce((a,b)=>a+b,0)/arr.length;
  };

  /* ---------- Frame aus 3 oder 4 Punkten bauen ---------- */
  const buildFrame = (poly:Pt[]): Pt[] | null => {
    if(poly.length<3) return null;
    const p1=poly[0], p2=poly[1], p3=poly[2];   // BL, BR, TR
    const p4=poly.length>=4 ? poly[3] : { x:p1.x+(p3.x-p2.x), y:p1.y+(p3.y-p2.y) }; // TL
    // Rückgabe: [TL, TR, BR, BL]
    return [p4, p3, p2, p1];
  };

  /* ---------- Bilinear ---------- */
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

  /* ---------- Module packen (robust) ---------- */
  const placeModules = (mppLocal:number, fr:Pt[])=>{
    const topM  = dist(fr[0],fr[1]) * mppLocal; // First
    const leftM = dist(fr[0],fr[3]) * mppLocal; // linker Ortgang

    const Wm = wmm/1000, Hm = hmm/1000;
    const modW = orient==="vertikal" ? Wm : Hm;
    const modH = orient==="vertikal" ? Hm : Wm;

    const stopU = topM  - EDGE_M; // Innenkante rechts
    const stopV = leftM - EDGE_M; // Innenkante unten

    const out:ModuleUV[]=[];
    let nx=0, ny=0, id=0;
    let v = EDGE_M;

    while (v + modH <= stopV + 1e-9) {
      let u = EDGE_M;
      let row = 0;
      while (u + modW <= stopU + 1e-9) {
        // reale Zelle (UV)
        const u0r=u/topM, v0r=v/leftM, u1r=(u+modW)/topM, v1r=(v+modH)/leftM;
        // optisch kleiner & zentriert
        const uc=(u0r+u1r)/2, vc=(v0r+v1r)/2;
        const hu=(u1r-u0r)/2*SHRINK, hv=(v1r-v0r)/2*SHRINK;
        const u0=uc-hu, u1=uc+hu, v0=vc-hv, v1=vc+hv;

        const poly=[ mapUV(u0,v0,fr), mapUV(u1,v0,fr), mapUV(u1,v1,fr), mapUV(u0,v1,fr) ];
        const okInside = samplesOn(poly).every(s=>pip(s.x,s.y,pts));
        const okMargin = samplesOn(poly).every(s=>(minDistToEdges(s,pts)*mppLocal)>=EDGE_M-1e-6);
        if(!okInside || !okMargin) break;

        out.push({id:String(id++), u0,v0,u1,v1});
        row++;
        u += modW + GAP_M;
      }
      if (row===0) break;
      if (nx===0) nx=row;
      ny++;
      v += modH + GAP_M;
    }

    setMods(out);
    setGrid({nx,ny});
    setMode("modules");
  };

  /* ---------- Auto-Ablauf nach „Polygon schließen“ ---------- */
  // 1) Klick auf "Polygon schließen" setzt nur Flags/States
  const handleClose = ()=>{
    if(pts.length<3) return;
    setClosed(true);
    const m = computeMPP(pts);
    const fr = buildFrame(pts);
    if (m)  setMpp(m);
    if (fr) setFrame(fr);
  };

  // 2) Sobald closed && mpp && frame vorhanden → Module zeichnen
  useEffect(()=>{
    if (closed && mpp && frame) {
      placeModules(mpp, frame);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, mpp, frame, wmm, hmm, orient]); // (Änderung Module-Einstellungen → Neu-Pack)

  /* ---------- UI ---------- */
  const pxPerM = mpp ? 1/mpp : 0;

  const resetAll = ()=>{
    setPts([]); setClosed(false); setMpp(null); setFrame(null);
    setMods([]); setGrid(null); setMode("polygon");
  };

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
          <b>Modus:</b> {mode==="polygon"?"Polygon setzen":"Module bearbeiten"}
        </div>

        {cover.kind==="tile" ? (
          <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
            <label>Ziegel Traufe:
              <input style={{width:90, marginLeft:6}} value={cntT} onChange={e=>setCntT(e.target.value)} />
            </label>
            <label>Ziegel Ortgang:
              <input style={{width:90, marginLeft:6}} value={cntO} onChange={e=>setCntO(e.target.value)} />
            </label>
          </div>
        ) : (
          <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
            <label>Länge Traufe (m):
              <input style={{width:110, marginLeft:6}} value={lenT} onChange={e=>setLenT(e.target.value)} />
            </label>
            <label>Länge Ortgang (m):
              <input style={{width:110, marginLeft:6}} value={lenO} onChange={e=>setLenO(e.target.value)} />
            </label>
          </div>
        )}

        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button onClick={handleClose} disabled={pts.length<3 || closed}>
            Polygon schließen
          </button>
          <button onClick={()=>{ setClosed(false); setMpp(null); setFrame(null); setMods([]); setGrid(null); setMode("polygon"); }}>
            Polygon öffnen
          </button>
          <button onClick={()=>setPts(p=>p.slice(0,-1))} disabled={closed||pts.length===0}>Letzten Punkt löschen</button>
          <button onClick={resetAll}>Fläche zurücksetzen</button>
        </div>

        <div style={{borderTop:"1px solid #e5e7eb", paddingTop:8}}>
          <div style={{fontWeight:600}}>
            Modulraster (Start: First & linker Ortgang, Rand 35 cm){grid?` • Module: ${grid.nx} × ${grid.ny}`:""}
          </div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            <label>Breite (mm):
              <input style={{width:90, marginLeft:6}} type="number" value={wmm} onChange={e=>setWmm(parseInt(e.target.value||"0",10))}/>
            </label>
            <label>Höhe (mm):
              <input style={{width:90, marginLeft:6}} type="number" value={hmm} onChange={e=>setHmm(parseInt(e.target.value||"0",10))}/>
            </label>
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
            <button onClick={()=>{ if(frame && mpp) placeModules(mpp, frame); }}>
              Module einzeichnen
            </button>
            <button onClick={()=>setMods([])} disabled={!mods.length}>Module löschen</button>
          </div>

          {mpp
            ? <b>Maßstab: {mpp.toFixed(5)} m/px {closed && pts.length>=3 && <> • Fläche: {(areaPx2(pts)*mpp*mpp).toFixed(2)} m²</>}</b>
            : <span><i>Hinweis:</i> Beim „Polygon schließen“ werden Maßstab & Module automatisch gesetzt. Wenn hier nichts steht, fehlen oben Eingabewerte (Ziegel/ Längen).</span>}
        </div>
      </div>

      {img && (
        <div style={{marginTop:12, position:"relative", display:"inline-block"}} onMouseMove={onMove} onMouseUp={()=>setDrag(null)} onMouseLeave={()=>setDrag(null)}>
          <img ref={imgRef} src={img} alt="Dach" style={{maxWidth:"100%", display:"block", cursor:"crosshair"}} onClick={onImgClick}/>
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
              return style==="full"
                ? <polygon key={m.id} points={ptsS} fill="url(#fullb)" opacity={alpha} stroke="#111" strokeWidth={0.6}/>
                : (()=>{ const cx=(poly[0].x+poly[2].x)/2, cy=(poly[0].y+poly[2].y)/2, d=8;
                         return <g key={m.id} opacity={alpha}>
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
