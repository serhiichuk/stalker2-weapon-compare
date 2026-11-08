import sys,os,json,re
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import resolve as R
import layers as LY
T={k:LY.table(k) for k in ('items','general','chars','attrs','effects','upgrades')}
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root: contains docs/
DATA=os.path.join(OUT,'docs','data'); os.makedirs(DATA,exist_ok=True)
D=R.ROOT
P_ITEM=D+'/ItemPrototypes.cfg.bin'; P_UP=D+'/UpgradePrototypes.cfg.bin'; P_EF=D+'/EffectPrototypes.cfg.bin'
P_GEN=D+'/WeaponData/WeaponGeneralSetupPrototypes.cfg.bin'; P_CHR=D+'/WeaponData/CharacterWeaponSettingsPrototypes.cfg.bin'
P_ATT=D+'/WeaponData/WeaponAttributesPrototypes.cfg.bin'
def clean(x): return x.strip() if isinstance(x,str) else x
def isempty(x): return clean(x) in ('','empty','Empty','None','none')
SKIP=re.compile(r'(Sound|Event|Mesh|Texture|Material|Anim|Socket|Particle|PFX|VFX|Blueprint|Curve|Icon|Rtpc|Switch|Audio|Path|Position|Rotation|Translation|AimAssist|Shake|Pattern)',re.I)
def flat(v,prefix,out):
    if isinstance(v,dict):
        for k,x in v.items(): flat(x,prefix+('.' if prefix else '')+k,out)
    elif isinstance(v,list):
        vs=[clean(x) for x in v]
        if all(not isinstance(x,(dict,list)) for x in vs):
            vs=[x for x in vs if not isempty(x)]
            if vs and not SKIP.search(prefix): out[prefix]=vs
        else:
            for i,x in enumerate(v): flat(x,'%s[%d]'%(prefix,i),out)
    else:
        v=clean(v)
        if v=='': return
        if SKIP.search(prefix.split('.')[-1]) or "'" in v or v.startswith('/'): return
        out[prefix]=v
def num(s):
    s=str(s).strip()
    m=re.fullmatch(r'(-?[0-9.]+)\s*(%|f)?',s)
    if not m: return None,None
    v=float(m.group(1)); return (v/100 if m.group(2)=='%' else v),('pct' if m.group(2)=='%' else 'abs')
def pretty(sid):
    s=re.sub(r'^Gun_?','',sid); s=re.sub(r'(_GS)$','',s); s=re.sub(r'_(ST|HG|PP|SG|SP|MG|DMR|AR|SR|SMG|GL)$','',s)
    return s.replace('_',' ')
import locres
LOC={k.split('|',1)[-1]:v for k,v in locres.parse(R.ROOT+'/../../Localization/Game/en/Game.locres').items()}
SHARED={x for v in json.load(open(os.path.join(OUT,'docs','assets','icons.json'))).get('weapons_sharing_icon',{}).values() for x in v}
ICONS=json.load(open(os.path.join(OUT,'docs','assets','icons.json')))
chr_roots=set(T['chars'].keys())
def name_key(sid):
    # The item's own LocalizationSID is the game's name key (e.g. myriflepack_GunKora_HG); fall back to SID-based keys.
    try:
        ls = clean(T['items'].resolve(sid).get('LocalizationSID',''))
    except Exception:
        ls = ''
    cands = []
    if ls and ls not in ('Empty','empty','None'): cands.append('sid_items_%s_name'%ls)
    cands += ['sid_items_%s_name'%sid,'sid_items_DLC01_%s_name'%sid]
    for k in cands:
        if k in LOC: return k,False
    return None,False
weapons=[]
for sid in T['items'].keys():
    it=T['items'].resolve(sid)
    if it.get('Type')!='EItemType::Weapon' or not it.get('GeneralWeaponSetup'): continue
    if sid.startswith(('Guard','Template','Melee')) or 'Tutorial' in sid or 'Launch' in sid: continue
    pa=clean(it.get('PlayerWeaponAttributes'))
    if pa not in T['attrs'].keys(): continue
    cs_key=clean(T['attrs'].resolve(pa).get('DefaultWeaponSettingsSID',pa))
    if cs_key not in chr_roots: cs_key=pa
    if cs_key not in chr_roots: continue
    gs=clean(it['GeneralWeaponSetup'])
    gen=T['general'].resolve(gs); chs=T['chars'].resolve(cs_key)
    vals={};src={}
    for name,tree,s in (('CharacterWeaponSettings',chs,'chr'),('WeaponGeneralSetup',gen,'gen')):
        o={}; flat(tree,'',o)
        for k,v in o.items():
            if k=='SID': continue
            kk=k if k not in vals else s+'.'+k
            vals[kk]=v; src[kk]=name
    for k in ['Weight','Cost','BaseDurability','ItemGridWidth','ItemGridHeight','ItemSlotType']:
        if k in it: vals['Item.'+k]=clean(it[k]); src['Item.'+k]='ItemPrototypes'
    ups=[clean(u) for u in gen.get('UpgradePrototypeSIDs',[]) if not isempty(u)]
    pre=[clean(u) for u in it.get('PreinstalledUpgrades',[]) if not isempty(u)]
    weapons.append(dict(Id=sid,Name=(LOC[name_key(sid)[0]] if name_key(sid)[0] else pretty(sid)),NameIsGuess=name_key(sid)[1],Description=LOC.get((name_key(sid)[0] or 'x').replace('_name','_description'),''),NameFromGame=name_key(sid)[0] is not None,GeneralSetup=gs,PlayerAttributes=pa,
        Parent=T['items'].parent(sid),Source=T['items'].origin(sid),Layers={'item':T['items'].origin(sid),'general':T['general'].origin(gs),'characterSettings':T['chars'].origin(cs_key)},CharacterSettingsSID=cs_key,WeaponType=gen.get('WeaponType'),Icon=ICONS['weapons'].get(sid) or ICONS['weapons'].get(sid.replace('_GS','')) or 'assets/weapons/%s.png'%sid,IconUpgraded=ICONS.get('weapons_upgraded',{}).get(sid,''),IconShared=sid in SHARED,
        IconSource=clean(it.get('Icon','')),Values=vals,ValueSource=src,UpgradeList=ups,PreinstalledUpgrades=pre,
        Attachments=[clean(a['AttachPrototypeSID']) for a in gen.get('CompatibleAttachments',[]) if isinstance(a,dict)],
        PreinstalledAttachments=[clean(a.get('AttachSID')) for a in gen.get('PreinstalledAttachmentsItemPrototypeSIDs',[]) if isinstance(a,dict)]))
byid={w['Id']:w for w in weapons}
for w in weapons:
    if w['Id']=='Deluxe_GunAK74_ST': w['Name']='AKM-74S (Deluxe copy)'; w['NameFromGame']=True
for w in weapons:
    par=w['Parent']; 
    if not w['NameFromGame']:
        for k in ('sid_items_%s_name'%w['GeneralSetup'],'sid_items_%s_name'%par):
            if k in LOC: w['Name']=LOC[k]+(' (variant)' if k.endswith(str(par)+'_name') else ''); break
    if not os.path.exists(os.path.join(OUT,'docs',w['Icon'])) and par in byid and os.path.exists(os.path.join(OUT,'docs',byid[par]['Icon'])): w['Icon']=byid[par]['Icon']; w['IconFromParent']=True
print(len(weapons),'weapons')
up_ids=sorted({u for w in weapons for u in w['UpgradeList']})
efcache={}
def effect(sid):
    sid=clean(sid)
    if isempty(sid) or sid not in T['effects'].keys(): return None
    if sid in efcache: return efcache[sid]
    e=T['effects'].resolve(sid)
    vmin,k=num(e.get('ValueMin','0')); vmax,_=num(e.get('ValueMax','0'))
    loc=clean(e.get('LocalizationSID',''))
    show=clean(e.get('ShowUpgradeEffect','true'))=='true'; showv=clean(e.get('ShowUpgradeEffectValue','true'))=='true'
    r=dict(SID=sid,Type=clean(e.get('Type','')).replace('EEffectType::',''),Value=vmin,ValueMax=vmax,Kind=k,RawValue=clean(e.get('ValueMin')),
        Text=clean(e.get('Text','')),LocalizationSID=loc,LocalizedName=LOC.get('sid_effects_%s_name'%loc,''),Positive=clean(e.get('Positive','')).replace('EBeneficial::',''),
        ShowUpgradeEffect=show,ShowUpgradeEffectValue=showv,UiVisible=bool(show and showv and not isempty(loc)),
        AttachmentItem=clean(e.get('AttachmentItemPrototypeSID','')))
    efcache[sid]=r; return r
upgrades={}
for u in up_ids:
    if u not in T['upgrades'].keys(): continue
    r=T['upgrades'].resolve(u)
    def L(k):
        v=r.get(k)
        return [clean(x) for x in v if not isempty(x)] if isinstance(v,list) else []
    effs=[]
    for es in L('EffectPrototypeSIDs'):
        e=effect(es)
        if e: effs.append(dict(e,Via='upgrade'))
    atts=L('AttachPrototypeSIDs')
    for a in atts:
        try: ai=T['items'].resolve(a)
        except KeyError: continue
        for es in ai.get('EffectPrototypeSIDs',[]):
            e=effect(es)
            if e: effs.append(dict(e,Via='attachment:'+a))
    def gv(k):
        v=r.get(k)
        return [(clean(x.get('GlobalVariableSID')),clean(x.get('Value'))) for x in v if isinstance(x,dict) and not isempty(x.get('GlobalVariableSID'))] if isinstance(v,list) else []
    icon=clean(r.get('Icon',''))
    upgrades[u]=dict(Id=u,Source=T['upgrades'].origin(u),TextKey=clean(r.get('Text')),HintKey=clean(r.get('Hint')),Name=LOC.get(clean(r.get('Text'))),Description=LOC.get(clean(r.get('Hint'))),
        Icon=ICONS['upgrades'].get(icon.split('/')[-1].split('.')[0].replace('T_PDA_Upgrades_','')) or 'assets/upgrades/%s.png'%icon.split('/')[-1].split('.')[0],IconSource=icon,
        ImageSource=clean(r.get('Image','')),
        BaseCost=num(r.get('BaseCost','0'))[0] or 0,Part=clean(r.get('UpgradeTargetPart','')).replace('EUpgradeTargetPartType::',''),
        Row=clean(r.get('VerticalPosition','')).replace('EUpgradeVerticalPosition::',''),Column=int(float(r.get('HorizontalPosition','0') or 0)),
        IsModification=clean(r.get('IsModification'))=='true',HiddenWithoutItem=clean(r.get('HiddenWihoutItem'))=='true',
        Attachments=atts,Effects=effs,
        Required=L('RequiredUpgradePrototypeSIDs'),Blocking=L('BlockingUpgradePrototypeSIDs'),Interchangeable=L('InterchangeableUpgradePrototypeSIDs'),
        RequiredItems=L('RequiredItemPrototypeSIDs'),Skills=L('Skills'),RequiredGlobalVariables=gv('RequiredGlobalVariables'),BlockingGlobalVariables=gv('BlockingGlobalVariables'),
        ConnectionLines=[clean(x).replace('EConnectionLineState::','') for x in r.get('ConnectionLines',[])],
        DiscountCoefficient=clean(r.get('DiscountCoefficient')),RepairCostModifier=clean(r.get('RepairCostModifier')))
    upgrades[u]['HasHiddenEffect']=any(not e['UiVisible'] for e in effs)
for u,x in upgrades.items():
    x['BlockedBy']=[v for v,y in upgrades.items() if u in y['Blocking']]
json.dump(weapons,open(DATA+'/weapons.json','w'),indent=1)
json.dump(upgrades,open(DATA+'/upgrades.json','w'),indent=1)
print(len(upgrades),'upgrades')
os.makedirs(OUT+'/decoded',exist_ok=True)
for name,t in [('WeaponGeneralSetup','general'),('WeaponAttributes','attrs'),('CharacterWeaponSettings','chars'),('Upgrades','upgrades'),('Effects','effects'),('Items','items')]:
    json.dump({k:T[t].resolve(k) for k in T[t].keys()},open(OUT+'/decoded/%s.resolved.json'%name,'w'))
# ---- DLC weapon list for icon extraction
dlc=[]
for w in weapons:
    if w['Source']=='base': continue
    it=T['items'].resolve(w['Id'])
    dlc.append(dict(SID=w['Id'],Source=w['Source'],Name=w['Name'],Parent=w['Parent'],IconTexture=clean(it.get('Icon','')),IconBigTexture=clean(it.get('IconBig','')),
        StatisticIcon=clean(it.get('StatisticIconImagePath','')),CurrentIconPath=w['Icon'],IconFromParent=w.get('IconFromParent',False),
        Attachments=[clean(a) for a in w['Attachments']],AttachmentIcons=[clean(a.get('WeaponSpecificIcon','')) for a in T['general'].resolve(w['GeneralSetup']).get('CompatibleAttachments',[]) if isinstance(a,dict) and a.get('WeaponSpecificIcon')]))
json.dump(dlc,open(OUT+'/dlc_weapons.json','w'),indent=1)
print(len(dlc),'dlc weapons')
