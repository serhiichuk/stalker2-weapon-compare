import os
import sys,os,glob,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import decode
WORK=os.environ.get('S2_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work'))
ROOT=os.path.join(WORK, 'gamedata', 'Stalker2', 'Content', 'GameLite', 'GameData')
_files={}
def load(path):
    if path not in _files:
        roots=decode.decode_bytes(open(path,'rb').read())
        _files[path]={'roots':{r['k']:r for r in roots},'cache':{}, 'order':[r['k'] for r in roots]}
    return _files[path]
def find_file(url,cur):
    if not url: return cur
    b=os.path.basename(url.replace(chr(92),'/'))
    if b.endswith('.cfg'): b+='.bin'
    if os.path.basename(cur)==b: return cur
    c=glob.glob(ROOT+'/**/'+b,recursive=True)
    return c[0] if c else cur
def isarr(n): return n['c'] and all(c['k'].startswith('[') for c in n['c'])
def conv(n):
    """node -> python value without inheritance"""
    if not n['c']:
        return n['v'] if (n['v'] or not n.get('tag')) else []
    if isarr(n): return [conv(c) for c in n['c']]
    d={}
    if n['v']: d['_value']=n['v']
    for c in n['c']: d[c['k']]=conv(c)
    return d
def merge(base,n):
    # n: node overriding resolved base value
    if base is None: return conv(n)
    if not n['c']:
        if n['v']: return n['v']
        return base if isinstance(base,(dict,list)) else n['v']
    if isinstance(base,list) and isarr(n):
        out=[]
        for c in n['c']:
            i=int(c['k'][1:-1])
            if c.get('tag')==5 and i<len(base) and isinstance(base[i],(dict,list)): out.append(merge(base[i],c))
            else: out.append(conv(c))
        return out
    if isinstance(base,dict) and not isarr(n):
        out=dict(base)
        if n['v']: out['_value']=n['v']
        for c in n['c']: out[c['k']]=merge(out.get(c['k']),c)
        return out
    return conv(n)
def resolve(path,key,_stack=()):
    f=load(path)
    if key in f['cache']: return f['cache'][key]
    n=f['roots'][key]
    base=None
    if n.get('tag')==1:
        pp=find_file(n.get('url',''),path)
        if (pp,n['str']) not in _stack and n['str'] in load(pp)['roots']:
            base=resolve(pp,n['str'],_stack+((path,key),))
    if base is None:
        r=conv(n)
    else:
        r=merge(base,n)
    f['cache'][key]=r
    return r
def parent_of(path,key):
    n=load(path)['roots'][key]; return n['str'] if n.get('tag')==1 else None
