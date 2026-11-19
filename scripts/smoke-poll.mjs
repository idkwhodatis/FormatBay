/** Poll awaited IPC snapshots; Playwright waitForFunction treats Promises as truthy. */
export async function pollValue(read,accept,{timeout=30000,interval=100,label='Condition'}={}) {
 const deadline=Date.now()+timeout;
 do {
  const value=await read();
  if(await accept(value))return value;
  if(Date.now()>=deadline)break;
  await new Promise(resolve=>setTimeout(resolve,interval));
 }while(Date.now()<=deadline);
 throw new Error(`${label} timed out`);
}
