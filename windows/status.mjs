import fs from 'node:fs';
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Qwen Minecraft</title><style>body{margin:0;background:#0d171d;color:#e8f3f7;font:16px system-ui}main{max-width:1100px;margin:32px auto;padding:0 20px}h1{font-size:24px}img{width:100%;aspect-ratio:16/9;background:#182a34;border-radius:12px}p{line-height:1.6}pre{white-space:pre-wrap;color:#aac4cd}b{color:#87dfb9}</style><main><h1>Qwen Minecraft · Native recording</h1><p id="summary">Waiting for game observations…</p><img id="frame" alt="Live native Minecraft frame"><p id="action"></p><pre id="inventory"></pre></main><script>async function refresh(){try{const s=await(await fetch('/')).json();document.querySelector('#summary').textContent=s.run+' · '+s.stage+' · Health '+s.health+'/20 · Step '+s.steps+' · '+s.plannerModel;document.querySelector('#action').textContent=s.active;document.querySelector('#inventory').textContent=JSON.stringify(s.inventory,null,2);document.querySelector('#frame').src='/preview.png?t='+Date.now()}catch{document.querySelector('#summary').textContent='Run is starting or has stopped. Recording files are preserved.'}}refresh();setInterval(refresh,2000)</script></html>`;
export function serveStatus(req,res,state) {
  res.setHeader('Cache-Control','no-store');
  if(req.url.split('?')[0]==='/view'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(req.url.split('?')[0]==='/preview.png'){
    try{res.setHeader('Content-Type','image/png');res.end(fs.readFileSync('native-client/native-preview.png'));}catch{res.writeHead(404);res.end('Native view is loading');}return;
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state()));
}
