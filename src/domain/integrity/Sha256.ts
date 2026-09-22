/**
 * Portable deterministic SHA-256 implementation for canonical dataset validators.
 */
export class Sha256 {
  private static readonly K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed8,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x4d2c6dfc, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66f, 0xb00327c8, 0xbf597fc7, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66f,
    0xbf597fc7, 0xc67178e2, 0xd192e819, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4d2c6dfc, 0x650a7354, 0x766a0abb, 0x84c87814, 0x8cc70208, 0x90befffa,
    0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  static hash(message: string): string {
    const bytes: number[] = [];
    for (let i=0;i<message.length;i++) {
      let code=message.charCodeAt(i);
      if(code<0x80) bytes.push(code);
      else if(code<0x800) bytes.push(0xc0|(code>>6),0x80|(code&0x3f));
      else if(code<0xd800||code>=0xe000) bytes.push(0xe0|(code>>12),0x80|((code>>6)&0x3f),0x80|(code&0x3f));
      else { i++; code=0x10000+(((code&0x3ff)<<10)|(message.charCodeAt(i)&0x3ff)); bytes.push(0xf0|(code>>18),0x80|((code>>12)&0x3f),0x80|((code>>6)&0x3f),0x80|(code&0x3f)); }
    }
    const bitLength=bytes.length*8;
    bytes.push(0x80); while(bytes.length%64!==56) bytes.push(0);
    const highBits=Math.floor(bitLength/0x100000000), lowBits=bitLength>>>0;
    bytes.push((highBits>>>24)&0xff,(highBits>>>16)&0xff,(highBits>>>8)&0xff,highBits&0xff,(lowBits>>>24)&0xff,(lowBits>>>16)&0xff,(lowBits>>>8)&0xff,lowBits&0xff);
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53f,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const rotr=(x:number,n:number)=>(x>>>n)|(x<<(32-n)),w=new Int32Array(64);
    for(let chunkStart=0;chunkStart<bytes.length;chunkStart+=64){
      for(let i=0;i<16;i++){const o=chunkStart+i*4;w[i]=(bytes[o]<<24)|(bytes[o+1]<<16)|(bytes[o+2]<<8)|bytes[o+3];}
      for(let i=16;i<64;i++){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for(let i=0;i<64;i++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),temp1=(h+S1+ch+Sha256.K[i]+w[i])|0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),temp2=(S0+maj)|0;h=g;g=f;f=e;e=(d+temp1)|0;d=c;c=b;b=a;a=(temp1+temp2)|0;}
      h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
    }
    const toHex=(n:number)=>(n>>>0).toString(16).padStart(8,'0');
    return toHex(h0)+toHex(h1)+toHex(h2)+toHex(h3)+toHex(h4)+toHex(h5)+toHex(h6)+toHex(h7);
  }
}
