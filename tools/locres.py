import struct,json,sys
def parse(path):
    d=open(path,'rb').read(); p=[17]
    def u32(): v=struct.unpack_from('<I',d,p[0])[0]; p[0]+=4; return v
    def i32(): v=struct.unpack_from('<i',d,p[0])[0]; p[0]+=4; return v
    def fs():
        n=i32()
        if n==0: return ''
        if n>0: s=d[p[0]:p[0]+n-1].decode('utf8','replace'); p[0]+=n; return s
        n=-n; s=d[p[0]:p[0]+2*(n-1)].decode('utf-16le'); p[0]+=2*n; return s
    off=struct.unpack_from('<q',d,p[0])[0]; p[0]+=8
    cnt=u32(); nsn=u32()
    ents=[]
    for _ in range(nsn):
        u32(); ns=fs(); kc=u32()
        for _ in range(kc):
            u32(); k=fs(); u32(); idx=i32(); ents.append((ns,k,idx))
    p[0]=off; n=i32(); strs=[]
    for _ in range(n): strs.append(fs()); i32()
    return {(ns+'|'+k if ns else k):strs[i] for ns,k,i in ents if 0<=i<len(strs)}
if __name__=='__main__':
    m=parse(sys.argv[1]); print(len(m))
    ks=[k for k in m if 'Upgrade' in k or 'upgrades' in k]; print(len(ks),ks[:8])
    for k in ks[:6]: print(k,'=>',m[k][:100])
    print([k for k in m if 'GunAK74_ST' in k][:10])
