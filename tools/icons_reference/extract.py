import sys,struct,glob,os,re,json
sys.path.insert(0,'pylib')
from PIL import Image
import io
S=os.getcwd()
def decode(f):
    b=open(f,'rb').read()
    i=b.find(b'PF_'); L=struct.unpack_from('<i',b,i-4)[0]
    fmt=b[i:i+L-1].decode()
    sx,sy=struct.unpack_from('<II',b,i-16)
    d=i+L+12
    if fmt=='PF_B8G8R8A8':
        n=sx*sy*4
        return Image.frombuffer('RGBA',(sx,sy),b[d:d+n],'raw','BGRA',0,1)
    if fmt=='PF_BC7':
        n=((sx+3)//4)*((sy+3)//4)*16
        hdr=b'DDS '+struct.pack('<7I',124,0x1|0x2|0x4|0x1000|0x80000,sy,sx,n,0,1)+b'\0'*44
        hdr+=struct.pack('<2I4s5I',32,4,b'DX10',0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)
        hdr+=struct.pack('<5I',98,3,0,1,0)
        im=Image.open(io.BytesIO(hdr+b[d:d+n])); im.load(); return im.convert('RGBA')
    raise Exception(fmt)
os.makedirs('out/site/assets/weapons',exist_ok=True);os.makedirs('out/site/assets/upgrades',exist_ok=True)
OVR={'t_inv_w_pkp_body':'GunPKP_MG','t_inv_w_gp3a_body_01':'GunGP3A_DMR'}
man={'upgrades':{}, 'weapons':{}, 'weapons_upgraded':{}, 'weapon_icons_other':{}, 'unmapped_weapon_textures':[], 'failed':[]}
for f in glob.glob('icons/raw_up/**/*.uexp',recursive=True):
    n=os.path.basename(f)[:-5].replace('T_PDA_Upgrades_','')
    try:
        im=decode(f); im.save(f'out/site/assets/upgrades/{n}.png'); man['upgrades'][n]=f'assets/upgrades/{n}.png'
    except Exception as e: man['failed'].append([f,str(e)])
# SID map
t=open('gamedata/Stalker2/Content/GameLite/GameData/ItemPrototypes.cfg.bin','rb').read().decode('latin1')
VALID=set(re.findall(r'(?<![A-Za-z0-9_])Gun[A-Za-z0-9_]*_(?:HG|PP|ST|MG|SG|SP|SR|AR|SMG|DMR|GL)(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])Gun_[A-Za-z0-9_]*_(?:HG|PP|ST|MG|SG|SP|SR|AR|SMG|DMR|GL)(?![A-Za-z0-9_])',t))
body2sid={}
for m in re.finditer(r"Texture2D'[^']*?Inventory/WeaponAndAttachments/\w+/(\w*body\w*)\.",t):
    pre=t[max(0,m.start()-500):m.start()]
    toks=re.findall(r'[A-Za-z0-9_]{5,}',pre)
    st=[re.sub(r'_(GS|Player|NPC)$','',k) for k in toks if not re.search(r'(StaticMesh|Skeletal|Upgrade)',k)]
    st=[k for k in st if k.startswith('Gun') and re.search(r'_(HG|PP|ST|MG|SG|SP|SR|AR|SMG|DMR|GL)$',k)]
    cand=[k for k in st if k in VALID] or st
    body2sid[m.group(1).lower()]=cand[-1] if cand else None
for f in glob.glob('icons/raw_w/**/*.uexp',recursive=True):
    n=os.path.basename(f)[:-5]; nl=n.lower(); rel=f.replace(chr(92),'/')
    isbody=('_body' in nl) or nl.startswith('t_inv_w_gp3a_body'); inweap='/Inventory/Weapons/' in rel
    if not(isbody or inweap): continue
    try: im=decode(f)
    except Exception as e: man['failed'].append([f,str(e)]); continue
    im.save(f'out/site/assets/weapons/{n}.png'); p=f'assets/weapons/{n}.png'
    if inweap: man['weapon_icons_other'][n]=p; continue
    base=nl[:-8] if nl.endswith('_upgrade') else nl
    sid=body2sid.get(base) or OVR.get(base)
    if sid is None and 'gp3a' in base: sid='GunGP3A_ST?'
    if sid is None: man['unmapped_weapon_textures'].append(n); continue
    (man['weapons_upgraded'] if nl.endswith('_upgrade') else man['weapons'])[sid]=p
json.dump(man,open('out/site/assets/icons.json','w'),indent=1)
print({k:(len(v)) for k,v in man.items()}); print(man['unmapped_weapon_textures'],man['failed'][:3])
print(json.dumps({k:v for k,v in body2sid.items()}))
