import sys,glob,os,re,json
sys.path.insert(0,'pylib'); sys.path.insert(0,'scripts')
import importlib.util
src=open('scripts/ui.py').read().split("A='out/site/assets/'")[0]
exec(src)
A='out/site/assets/'
def idxname(root):
    m={}
    for f in glob.glob(root+'/**/*.uexp',recursive=True):
        m[os.path.basename(f)[:-5].lower()]=f
    return m
tex={}
tex.update(idxname('icons/raw_w')); tex.update(idxname('icons/raw_dlc'))
man=json.load(open(A+'icons.json'))
W=man['weapons']; WU=man['weapons_upgraded']
def ensure(n):
    f=tex.get(n.lower())
    if not f: return None
    real=os.path.basename(f)[:-5]
    p=f'assets/weapons/{real}.png'
    if not os.path.exists('out/site/'+p): decode(f).save('out/site/'+p)
    return p
def setw(sid,name,src):
    p=ensure(name)
    if not p: return False
    pu=ensure(name+'_upgrade')
    W[sid]=p
    if pu: WU[sid]=pu
    elif sid in WU and src!='dlc': pass
    prov[sid]=(name,src); return True
prov={}
# authoritative: base Items.resolved
it=json.load(open('out/decoded/Items.resolved.json'))
miss=[]
for v in it.values():
    if v.get('Type')!='EItemType::Weapon' or v['SID'].startswith(('Guard','Template')): continue
    m=re.search(r"/(\w[\w-]*)\.[\w-]+'",v.get('Icon',''))
    if not m or m.group(1)=='Placeholder': continue
    if not setw(v['SID'],m.group(1),'items'): miss.append(v['SID'])
# DLC items
for f in sorted(glob.glob('gamedata_dlc/*/Stalker2/Content/GameLite/DLCGameData/*/ItemPrototypes.cfg.bin')):
    t=open(f,'rb').read().decode('latin1')
    for m in re.finditer(r"Texture2D'[^']*?WeaponAndAttachments/\w+/([\w-]*(?:body|Skin\w*_01))\.",t,re.I):
        n=m.group(1)
        if re.search('stat',n,re.I): continue
        pre=t[max(0,m.start()-700):m.start()]
        toks=re.findall(r'[A-Za-z0-9_]{5,}',pre)
        sids=[k for k in toks if k.startswith('Gun') and not re.search('StaticMesh|Skeletal|Upgrade|Mag|Scope|Silen|Muz|Grip|Laser',k)]
        cand=[k for k in toks if k.startswith('Gun') and re.search(r'_(GS|Player|NPC)$',k) and not re.search('Upgrade|StaticMesh',k)]
        if not cand: continue
        sid=re.sub(r'_(GS|Player|NPC)$','',cand[-1])
        if re.search('Monolit_',sid): continue
        if not setw(sid,n,'dlc'): miss.append(sid)
# manual DLC cases where icon precedes/skin textures
for sid,n in {'GunAK9_ST':'T_Inv_W_AK-9_Body_01','GunKharodFreedom_ST':'T_Inv_W_Kharod_SkinFreedom_01','GunDniproDuty_ST':'T_Inv_W_Dnipro_SkinDuty_01','GunWarszawa_AR':'T_inv_w_arev_body','GunSVU_CQB_SP':'T_inv_w_svu_body','GunSPSA_Sniper_SG':'T_inv_w_spsa_body'}.items():
    if not setw(sid,n,'dlc'): miss.append(sid)
# gauss scar upgraded variant
if 'T_inv_w_gauss_scar_body_upgrade'.lower() in tex:
    WU['GunGauss_Scar_SP']=ensure('T_inv_w_gauss_scar_body_upgrade')
man['weapons']=dict(sorted(W.items())); man['weapons_upgraded']=dict(sorted(WU.items()))
used={os.path.basename(p)[:-4].lower() for p in list(W.values())+list(WU.values())}
man['unmapped_weapon_textures']=[n for n in man['unmapped_weapon_textures'] if n.lower() not in used]
man['weapon_icon_source']={k:v[0] for k,v in prov.items()}
# shared-icon report
from collections import defaultdict
g=defaultdict(list)
for k,(n,s) in prov.items(): g[n].append(k)
man['weapons_sharing_icon']={n:s for n,s in g.items() if len(s)>1}
json.dump(man,open(A+'icons.json','w'),indent=1)
print('weapons',len(W),'upgraded',len(WU),'miss',miss)
print('still unmapped textures',man['unmapped_weapon_textures'])
print(json.dumps(man['weapons_sharing_icon'],indent=0))
# attachments from DLC bins
ai=json.load(open(A+'attachment_img.json')); bw=ai['by_weapon_attachment']; ba=ai['by_attachment']; added=0
for f in sorted(glob.glob('gamedata_dlc/*/Stalker2/Content/GameLite/DLCGameData/*/WeaponData/WeaponGeneralSetupPrototypes.cfg.bin')):
    t=open(f,'rb').read().decode('latin1')
    for m in re.finditer(r"Texture2D'[^']*?WeaponAndAttachments/\w+/([\w-]+)\.",t):
        n=m.group(1)
        if n.lower().endswith('_upgrade') or n.lower() not in tex: continue
        pre=t[max(0,m.start()-1500):m.start()]
        toks=re.findall(r'[A-Za-z0-9_]{3,}',pre)
        toks=[k for k in toks if k!='Texture2D']
        ws=[k for k in toks if re.match(r'Gun\w+_GS$',k)]
        if not toks or not ws: continue
        att=toks[-1]; w=ws[-1][:-3]
        os.makedirs(A+'attachment_img',exist_ok=True)
        real=os.path.basename(tex[n.lower()])[:-5]; out=f'attachment_img/{real}.png'
        if not os.path.exists(A+out): small(decode(tex[n.lower()])).save(A+out,optimize=True)
        k=f'{w}|{att}'
        if k not in bw: bw[k]=out; added+=1
        ba.setdefault(att,out)
json.dump(ai,open(A+'attachment_img.json','w'),indent=1); print('att added',added)
