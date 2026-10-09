import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));process.chdir(root);
const run=process.argv[2]||'qwen-'+new Date().toISOString().replace(/[:.]/g,'-');
if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(run))throw Error('Invalid run name');
const config=JSON.parse(fs.readFileSync('.runtime/config.json'));
if(!fs.existsSync('server/eula.txt')||!/^eula=true\s*$/m.test(fs.readFileSync('server/eula.txt','utf8')))throw Error('Accept the Minecraft EULA in server/eula.txt before starting: https://aka.ms/MinecraftEULA');
if(fs.existsSync('runs/'+run)||fs.existsSync('server/'+run))throw Error('Use a fresh run/world name');
const runtimeDir='.runtime/runs/'+run;fs.mkdirSync(runtimeDir,{recursive:true});
const children=new Map();let stopping=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(predicate,ms,label){const until=Date.now()+ms;while(Date.now()<until){if(await predicate())return;for(const [name,child] of children)if(child.exitCode!==null)throw Error(name+' exited during startup; inspect '+runtimeDir+'/'+name+'.stderr.log');await sleep(500);}throw Error(label+' timed out');}
const available=port=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});
const listening=port=>new Promise(resolve=>{const s=net.connect({port,host:'127.0.0.1'});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
function launch(name,exe,args,{cwd=root,env={}}={}) {
  const stdout=fs.openSync(runtimeDir+'/'+name+'.stdout.log','a'),stderr=fs.openSync(runtimeDir+'/'+name+'.stderr.log','a');
  const child=spawn(exe,args,{cwd,env:{...process.env,...env},stdio:['pipe',stdout,stderr],windowsHide:true});
  fs.closeSync(stdout);fs.closeSync(stderr);children.set(name,child);
  child.on('error',e=>console.error(name,e));return child;
}
function archiveControl(file){if(fs.existsSync(file)){const dest=path.join('.trash','startup-'+run,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.renameSync(file,dest);}}
async function finishChild(name,ms=15000){const child=children.get(name);if(!child||child.exitCode!==null)return;await Promise.race([once(child,'exit'),sleep(ms)]);if(child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),sleep(5000)]);}}
async function shutdown(reason){
  if(stopping)return;stopping=true;console.log('Stopping:',reason);
  if(fs.existsSync('runs/'+run))fs.writeFileSync('runs/'+run+'/stop',reason);
  await finishChild('agent',130000);
  const finished='runs/'+run+'/full-playthrough.mp4.finished.json';
  if(fs.existsSync('native-client/record-path.txt')){
    archiveControl('native-client/record-path.txt');
    await Promise.race([waitFor(()=>fs.existsSync(finished),45000,'Recorder finalization').catch(e=>console.error(e.message)),sleep(46000)]);
  }
  const server=children.get('server');if(server?.exitCode===null)server.stdin.write('stop\n');
  await finishChild('server',60000);await finishChild('client',1000);await finishChild('relay',1000);
  fs.writeFileSync(runtimeDir+'/finished.json',JSON.stringify({run,reason,at:new Date().toISOString(),children:Object.fromEntries([...children].map(([k,c])=>[k,{pid:c.pid,exitCode:c.exitCode}]))},null,2));
}

let stopTimer;
try {
  for(const port of [25576,25578,3078,3093,3099])await available(port);
  const health=await (await fetch(config.modelBase.replace(/\/v1\/?$/,'')+'/health',{signal:AbortSignal.timeout(5000)})).json();if(health.status!=='ok')throw Error('Local Qwen is not ready');
  const env={RUN_ID:run,PLANNER_MODEL:config.model,CONTROLLER_MODEL:config.model,MODEL_RELAY:'http://127.0.0.1:3099',QWEN_BASE_URL:config.modelBase,NATIVE_VIEW:'1',WAIT_NATIVE:'1',NATIVE_RECORD:'1',DRAGON_SENSOR_URL:'http://127.0.0.1:3093',PLANNER_INTERVAL_MS:'60000',FFMPEG_PATH:config.ffmpeg,TEMP:path.resolve('.runtime/temp'),TMP:path.resolve('.runtime/temp')};
  process.env.PLANNER_MODEL=config.model;process.env.CONTROLLER_MODEL=config.model;
  execFileSync(process.execPath,['optimization/nether/freeze-run.mjs',run],{stdio:'inherit',windowsHide:true});
  fs.writeFileSync('server/server.properties',[`level-name=${run}`,'level-seed=8398967436125155523','gamemode=survival','difficulty=peaceful','server-ip=127.0.0.1','server-port=25576','online-mode=false','spawn-protection=0','view-distance=6','max-players=2','allow-nether=true','enable-rcon=false','enable-command-block=false','motd=Local Qwen recording'].join('\n')+'\n');
  for(const file of ['resources-ready.txt','capture-heartbeat.json','record-path.txt','native-preview.png','ui-command.txt','ui-ack.txt'])archiveControl('native-client/'+file);
  launch('server',config.java,['-javaagent:'+path.resolve('observer/dragon-observer.jar')+'=3093','-Xms256M','-Xmx1024M','-jar','server.jar','nogui'],{cwd:path.resolve('server'),env});
  await waitFor(async()=>await listening(25576)&&/Done \(/.test(fs.readFileSync(runtimeDir+'/server.stdout.log','utf8')),120000,'Minecraft server');
  launch('relay',process.execPath,[path.resolve('qwen-relay.mjs')],{env});await waitFor(()=>listening(3099),10000,'Qwen relay');
  const agent=launch('agent',process.execPath,[path.resolve('nether-agent.mjs')],{env});await waitFor(()=>listening(25578),30000,'Native mirror');
  const clientArgs=JSON.parse(execFileSync('python',['-B','windows/client.py'],{encoding:'utf8',windowsHide:true}));
  launch('client',clientArgs[0],clientArgs.slice(1),{env});
  fs.writeFileSync(runtimeDir+'/processes.json',JSON.stringify({run,supervisor:process.pid,started:new Date().toISOString(),children:Object.fromEntries([...children].map(([k,c])=>[k,{pid:c.pid,spawnfile:c.spawnfile}]))},null,2));
  console.log('Recording run:',run,'Status: http://127.0.0.1:3078');
  const maxMinutes=Number(process.env.MAX_RUN_MINUTES||60);
  const deadline=Date.now()+maxMinutes*60000;
  stopTimer=setInterval(()=>{if(fs.existsSync(runtimeDir+'/stop')||Date.now()>deadline)fs.writeFileSync('runs/'+run+'/stop',Date.now()>deadline?'Run time limit':'User requested stop');},1000);
  process.on('SIGINT',()=>fs.writeFileSync('runs/'+run+'/stop','User interrupted'));
  const [code]=await once(agent,'exit');if(code!==0)throw Error('Agent failed; inspect its log');
  await shutdown(fs.existsSync('runs/'+run+'/victory.json')?'Victory':'Run stopped without victory');
  if(fs.existsSync('runs/'+run+'/victory.json')){
    const result=spawn(process.execPath,['verify-run.mjs',run,run],{env:{...process.env,FFMPEG_PATH:config.ffmpeg},stdio:'inherit',windowsHide:true});const [code]=await once(result,'exit');if(code!==0)throw Error('Victory verification failed');
    console.log('Verified victory video:',path.resolve('runs/'+run+'/full-playthrough.mp4'));
  }
} catch(error){console.error(error);await shutdown(error.message);process.exitCode=1;}
finally{clearInterval(stopTimer);}
