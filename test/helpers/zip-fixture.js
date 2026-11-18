// Minimal stored ZIP fixture writer, not production archive code.
export function zipFixture(entries) {
 let offset=0;const locals=[],central=[];
 for(const {name,data='bytes',mode=0o100644} of entries){
  const n=Buffer.from(name),body=Buffer.from(data),local=Buffer.alloc(30),header=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(n.length,26);
  header.writeUInt32LE(0x02014b50);header.writeUInt16LE(0x0314,4);header.writeUInt16LE(20,6);header.writeUInt32LE(body.length,20);header.writeUInt32LE(body.length,24);header.writeUInt16LE(n.length,28);header.writeUInt32LE((mode<<16)>>>0,38);header.writeUInt32LE(offset,42);
  const item=Buffer.concat([local,n,body]);locals.push(item);central.push(header,n);offset+=item.length;
 }
 const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,index,end]);
}
