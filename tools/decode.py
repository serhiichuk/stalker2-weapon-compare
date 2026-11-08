"""Decoder for S.T.A.L.K.E.R. 2 *.cfg.bin files.
Layout (reverse engineered):
  u32 version(2); u32 nstrings(incl. idx0=''); u32 0
  nstrings-1 x [u32 len(incl NUL), bytes]   -- string table, 1-based idx
  12 zero bytes (3 empty u32), u8 0
  u32 rootcount, then rootcount nodes
Node: u32 key, u32 key2, u32 val, u32 ref, u8 tag,
      if tag in (1,5,7): u32 len + str (parent / full path), u32 0
      u32 childcount, then children
"""
import struct, sys, json, os
class Reader:
    def __init__(s, data): s.d=data; s.p=0
    def u32(s): v=struct.unpack_from('<I',s.d,s.p)[0]; s.p+=4; return v
    def u8(s): v=s.d[s.p]; s.p+=1; return v
    def lstr(s):
        n=s.u32()
        if n==0: return ''
        if n>=0x80000000:  # negative length: UTF-16LE, |n| chars incl. NUL
            n=(1<<32)-n; v=s.d[s.p:s.p+2*(n-1)].decode('utf-16le','replace'); s.p+=2*n; return v
        v=s.d[s.p:s.p+n-1].decode('utf8','replace'); s.p+=n; return v
def decode_bytes(data):
    r=Reader(data)
    ver=r.u32(); n=r.u32(); r.u32()
    S=['']
    for _ in range(n-1): S.append(r.lstr())
    r.p+=12; r.u8()
    tags=set()
    def node():
        k=r.u32(); k2=r.u32(); v=r.u32(); ref=r.u32(); tag=r.u8()
        tags.add(tag)
        nd={'k':S[k],'v':S[v]}
        if k!=k2: nd['k2']=S[k2]
        if ref: nd['ref']=S[ref]
        if tag: nd['tag']=tag
        if tag in (1,5,7):
            nd['str']=r.lstr(); x=r.lstr()
            if x: nd['url']=x
        elif tag not in (0,2): raise ValueError("unknown tag %d at %d"%(tag,r.p))
        c=r.u32()
        nd['c']=[node() for _ in range(c)]
        return nd
    cnt=r.u32()
    roots=[node() for _ in range(cnt)]
    if r.p!=len(data): raise ValueError('trailing %d bytes at %d/%d'%(len(data)-r.p,r.p,len(data)))
    return roots
def tojson(nd):
    """Compact: struct -> dict, leaf -> value string."""
    if not nd['c'] and not nd.get('tag'):
        return nd['v']
    o={}
    if nd['v']: o['_value']=nd['v']
    if nd.get('tag')==1: o['_parent']=nd['str']
    for c in nd['c']:
        o.setdefault(c['k'],tojson(c)) if c['k'] not in o else o.__setitem__(c['k'], tojson(c))
    return o
if __name__=='__main__':
    roots=decode_bytes(open(sys.argv[1],'rb').read())
    print(len(roots),'roots')
