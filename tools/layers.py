"""Layered resolver: base GameData + DLC layers (PreOrder, Deluxe, Ultimate, DLC1).
A SID defined in a later layer overlays (merge) the same SID from earlier layers; parents (refkey)
are looked up in the node's own layer file first, then in any layer of the same logical table (base first)."""
import os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import decode, resolve as R
SCR=os.environ.get('S2_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work'))
BASE=R.ROOT
DLC=SCR+'/gamedata_dlc'
LAYERS=[('base',BASE),('PreOrder',DLC+'/pakchunk101/Stalker2/Content/GameLite/DLCGameData/PreOrder'),
        ('Deluxe',DLC+'/pakchunk102/Stalker2/Content/GameLite/DLCGameData/Deluxe'),
        ('Ultimate',DLC+'/pakchunk104/Stalker2/Content/GameLite/DLCGameData/Ultimate'),
        ('DLC1',DLC+'/DLC1/Stalker2/Content/GameLite/DLCGameData/DLC1')]
TABLES={'general':'WeaponData/WeaponGeneralSetupPrototypes','chars':'WeaponData/CharacterWeaponSettingsPrototypes',
        'attrs':'WeaponData/WeaponAttributesPrototypes','items':'ItemPrototypes','effects':'EffectPrototypes','upgrades':'UpgradePrototypes'}
class Table:
    def __init__(s,name):
        s.name=name; s.layers=[]  # (layer, roots dict, order)
        for ln,root in LAYERS:
            f='%s/%s.cfg.bin'%(root,TABLES[name])
            if os.path.exists(f):
                roots=decode.decode_bytes(open(f,'rb').read())
                s.layers.append((ln,{r['k']:r for r in roots},[r['k'] for r in roots]))
        s.cache={}
    def keys(s):
        seen=[];S=set()
        for ln,d,o in s.layers:
            for k in o:
                if k not in S: S.add(k); seen.append(k)
        return seen
    def layers_of(s,key): return [ln for ln,d,o in s.layers if key in d]
    def origin(s,key):
        l=s.layers_of(key); return l[0] if l else None   # first layer defining it (base if base-defined)
    def resolve(s,key,upto=None,_stack=()):
        ck=(key,upto)
        if ck in s.cache: return s.cache[ck]
        val=None; 
        for idx,(ln,d,o) in enumerate(s.layers):
            if key not in d: continue
            n=d[key]; base=val
            if n.get('tag')==1 and n['str']!=key or (n.get('tag')==1 and base is None):
                par=n['str']
                if (par,ln) not in _stack and any(par in dd for _,dd,_ in s.layers):
                    pv=s.resolve(par,None,_stack+((key,ln),))
                    base=pv if base is None else base
                    if base is not None and val is None: base=pv
            val=R.merge(base,n) if base is not None else R.conv(n)
        s.cache[ck]=val; return val
    def parent(s,key):
        for ln,d,o in reversed(s.layers):
            if key in d and d[key].get('tag')==1: return d[key]['str']
        return None
_tabs={}
def table(name):
    if name not in _tabs: _tabs[name]=Table(name)
    return _tabs[name]
