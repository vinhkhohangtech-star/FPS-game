// shared: align math + offline measure
window.alignQuat=(f)=>{const F=new THREE.Vector3(...f).normalize();const R=new THREE.Vector3().crossVectors(F,new THREE.Vector3(0,1,0)).normalize();const U=new THREE.Vector3().crossVectors(R,F);
 const m=new THREE.Matrix4().makeBasis(R,U,F.clone().negate());return new THREE.Quaternion().setFromRotationMatrix(m).invert()};
window.toCam=(p,eye,f,s)=>{const q=alignQuat(f);return new THREE.Vector3(...p).sub(new THREE.Vector3(...eye)).multiplyScalar(s).applyQuaternion(q)};
window.measureSights=(gl,eye,f,armRe,flat)=>{const v=new THREE.Vector3();const q=alignQuat(f);const pts=[],lens=[];
 gl.scene.traverse(o=>{if(!o.isMesh||!o.visible)return;const mn=(o.material&&o.material.name)||'';if(armRe.test(o.name)||armRe.test(mn))return;const isLens=/lens|glass/i.test(o.name+mn);const pos=o.geometry.attributes.position;const st=Math.max(1,Math.floor(pos.count/6000));
  for(let i=0;i<pos.count;i+=st){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);const c=v.clone().sub(new THREE.Vector3(...eye)).applyQuaternion(q);(isLens?lens:pts).push([c,v.clone()])}});
 // camera space: x right, y up, -z forward
 let zmin=1e9,zmax=-1e9;pts.forEach(([c])=>{zmin=Math.min(zmin,c.z);zmax=Math.max(zmax,c.z)});// zmin = muzzle (most forward)
 const L=zmax-zmin; const frac=(c)=>(zmax-c.z)/L; // 0 at rear, 1 at muzzle
 // gun centre x from the front 30%
 const fx=pts.filter(([c])=>frac(c)>0.75).map(([c])=>c.x).sort((a,b)=>a-b);const cx=fx[Math.floor(fx.length/2)];
 const near=pts.filter(([c])=>Math.abs(c.x-cx)<0.04*L);
 const top=(a,b)=>{let best=null;near.forEach(p=>{const s=frac(p[0]);if(s>=a&&s<=b&&(!best||p[0].y>best[0].y))best=p});return best};
 let rear,front;
 if(lens.length){const lc=new THREE.Vector3(),lw=new THREE.Vector3();lens.forEach(([c,w])=>{lc.add(c);lw.add(w)});lc.divideScalar(lens.length);lw.divideScalar(lens.length);
   // sight line parallel to bore (forward)
   rear=lw.clone();front=lw.clone().add(new THREE.Vector3(...f).normalize().multiplyScalar(L*0.2));}
 else {front=top(0.82,1.0)[1];
   const cen=(a,b)=>{const w=new THREE.Vector3();let n=0;pts.forEach(([c,ww])=>{const s=frac(c);if(s>=a&&s<=b){w.add(ww);n++}});return w.divideScalar(n)};
   const bore=cen(0.9,1.0).sub(cen(0.3,0.5)).normalize(); window._bore=bore;
   rear=front.clone().addScaledVector(bore,-0.4*L);
   if(flat){let my=-1e9;near.forEach(([c,ww])=>{const s=frac(c);if(s>=0.25&&s<=1&&c.y>my)my=c.y});
     const fc=new THREE.Vector3(...front.toArray()).sub(new THREE.Vector3(...eye)).applyQuaternion(q);fc.y=my+0.004*L;
     const qi=q.clone().invert();front=fc.clone().applyQuaternion(qi).add(new THREE.Vector3(...eye));
     rear=front.clone().addScaledVector(new THREE.Vector3(...f).normalize(),-0.4*L);}}
 let mz=null;pts.forEach(p=>{if(!mz||p[0].z<mz[0].z)mz=p});
 // muzzle: average of points within 1% of the front
 const mp=pts.filter(([c])=>c.z<zmin+0.01*L);const mw=new THREE.Vector3();mp.forEach(([c,w])=>mw.add(w));mw.divideScalar(mp.length);
 return {rear:rear.toArray(),front:front.toArray(),muzzle:mw.toArray(),L,lens:lens.length};
};
