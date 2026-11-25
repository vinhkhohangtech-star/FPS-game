import json,struct,sys,io
from PIL import Image
def compress(src,dst,maxdim=1024,q=82):
    d=open(src,'rb').read()
    L=struct.unpack('<I',d[12:16])[0]; J=json.loads(d[20:20+L]); B=d[20+L+8:]
    # KHR_materials_pbrSpecularGlossiness is not supported by three.js r160: convert to metal/rough
    for m in J.get('materials',[]):
        sg=m.get('extensions',{}).pop('KHR_materials_pbrSpecularGlossiness',None)
        if sg is not None:
            pbr=m.setdefault('pbrMetallicRoughness',{})
            if 'diffuseTexture' in sg: pbr['baseColorTexture']=sg['diffuseTexture']
            if 'diffuseFactor' in sg: pbr['baseColorFactor']=sg['diffuseFactor']
            pbr['metallicFactor']=0.0; pbr['roughnessFactor']=max(0.2,1.0-sg.get('glossinessFactor',0.5))
            if not m['extensions']: del m['extensions']
    for k in ('extensionsUsed','extensionsRequired'):
        if k in J:
            J[k]=[e for e in J[k] if e!='KHR_materials_pbrSpecularGlossiness']
            if not J[k]: del J[k]
    imgviews={im['bufferView']:i for i,im in enumerate(J.get('images',[])) if 'bufferView' in im}
    newbin=bytearray(); 
    for vi,bv in enumerate(J['bufferViews']):
        off=bv.get('byteOffset',0); raw=B[off:off+bv['byteLength']]
        if vi in imgviews:
            im=J['images'][imgviews[vi]]
            img=Image.open(io.BytesIO(raw)); img.load()
            alpha = img.mode in ('RGBA','LA') or (img.mode=='P' and 'transparency' in img.info)
            if alpha:
                a=img.convert('RGBA').getchannel('A'); alpha = a.getextrema()[0] < 250
            w,h=img.size; s=min(1,maxdim/max(w,h))
            if s<1: img=img.resize((max(1,int(w*s)),max(1,int(h*s))),Image.LANCZOS)
            out=io.BytesIO()
            if alpha: img.convert('RGBA').save(out,'PNG',optimize=True); im['mimeType']='image/png'
            else: img.convert('RGB').save(out,'JPEG',quality=q,optimize=True); im['mimeType']='image/jpeg'
            raw=out.getvalue()
        while len(newbin)%4: newbin.append(0)
        bv['byteOffset']=len(newbin); bv['byteLength']=len(raw); newbin+=raw
    while len(newbin)%4: newbin.append(0)
    J['buffers']=[{'byteLength':len(newbin)}]
    js=json.dumps(J,separators=(',',':')).encode()
    while len(js)%4: js+=b' '
    total=12+8+len(js)+8+len(newbin)
    o=struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(newbin),0x004E4942)+bytes(newbin)
    open(dst,'wb').write(o); print(dst.split('/')[-1], round(len(d)/1e6,1),'->',round(len(o)/1e6,2),'MB')
if __name__=='__main__':
    compress(sys.argv[1],sys.argv[2],int(sys.argv[3]) if len(sys.argv)>3 else 1024)
