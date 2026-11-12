export class Sound {
 context:AudioContext|null=null;muted=false;
 unlock(){this.context??=new AudioContext();void this.context.resume();}
 shot(volume=.15){
  if(!this.context||this.muted)return;
  const ctx=this.context,buffer=ctx.createBuffer(1,ctx.sampleRate*.085,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.018));
  const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1800;source.buffer=buffer;gain.gain.value=volume;source.connect(filter).connect(gain).connect(ctx.destination);source.start();
 }
}
