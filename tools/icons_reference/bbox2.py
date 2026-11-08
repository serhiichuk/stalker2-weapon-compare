import sys,json,os
sys.path.insert(0,'pylib')
from PIL import Image
site='out/site'
m=json.load(open(site+'/assets/icons.json')); out=json.load(open(site+'/assets/wbbox.json')); n0=len(out)
cache={}
ids=dict(m['weapons'])
for x in json.load(open(site+'/data/weapons.json')):
    if x.get('Icon') and x['Id'] not in ids: ids[x['Id']]=x['Icon']
for sid,p in ids.items():
    if sid in out or not os.path.exists(site+'/'+p): continue
    if p not in cache:
        im=Image.open(site+'/'+p).convert('RGBA'); a=im.split()[3].point(lambda v:255 if v>40 else 0); bb=a.getbbox(); W,H=im.size
        x0,y0,x1,y1=bb; cache[p]=[round(1-x1/W,4),round(y0/H,4),round(1-x0/W,4),round(y1/H,4)]
    out[sid]=cache[p]
json.dump(out,open(site+'/assets/wbbox.json','w')); print(n0,len(out))
