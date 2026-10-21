// A local, generated two-second chime: no downloaded sound or network dependency.
export class ReminderAudio{
 private context:AudioContext|null=null;
 private cleanup:ReturnType<typeof setTimeout>|null=null;
 private generation=0;
 stop(){this.generation++;if(this.cleanup)clearTimeout(this.cleanup);this.cleanup=null;const c=this.context;this.context=null;if(c&&c.state!=='closed')void c.close().catch(()=>{});}
 async play(volume:number){
  this.stop();if(volume<=0)return;
  const generation=this.generation,context=new AudioContext();this.context=context;
  try{
  await context.resume();if(generation!==this.generation)return;
  if(context.state!=='running')throw new Error('声音未能播放，请检查系统音量和输出设备。');
  const start=context.currentTime+.04,level=Math.min(100,Math.max(0,volume))/100;
  for(const [offset,frequency,duration] of [[0,660,.5],[.6,880,.5],[1.2,1100,.75]]){
   const tone=context.createOscillator(),gain=context.createGain();tone.type='sine';tone.frequency.value=frequency;
   gain.gain.setValueAtTime(0,start+offset);gain.gain.linearRampToValueAtTime(.3*level,start+offset+.025);gain.gain.exponentialRampToValueAtTime(.001,start+offset+duration);
   tone.connect(gain);gain.connect(context.destination);tone.start(start+offset);tone.stop(start+offset+duration);
  }
  this.cleanup=setTimeout(()=>{if(generation===this.generation)this.stop();},2300);
  }catch(error){if(generation===this.generation)this.stop();throw error;}
 }
}
