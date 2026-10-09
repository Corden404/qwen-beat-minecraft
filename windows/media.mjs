import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
export function probeVideo(file,{decode=false}={}) {
  const executable=process.env.FFMPEG_PATH||'ffmpeg';
  const args=decode?['-hide_banner','-nostats','-i',file,'-map','0:v:0','-progress','pipe:1','-f','null','-']:['-hide_banner','-i',file];
  const result=spawnSync(executable,args,{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
  if(result.error)throw result.error;
  if(decode&&result.status!==0)throw Error('Video decode failed: '+result.stderr.slice(-2000));
  const duration=/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(result.stderr);
  const stream=result.stderr.split('\n').find(line=>/Stream.*Video:/.test(line));
  const dimensions=/(\d{2,5})x(\d{2,5})/.exec(stream||''),fps=/([\d.]+) fps/.exec(stream||'');
  if(!duration||!dimensions||!fps)throw Error('Cannot read video metadata');
  return {format:{duration:Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]),size:fs.statSync(file).size},streams:[{width:Number(dimensions[1]),height:Number(dimensions[2]),r_frame_rate:fps[1]+'/1'}],decoded:decode,frames:decode?Number([...result.stdout.matchAll(/^frame=(\d+)$/gm)].at(-1)?.[1]):undefined};
}
