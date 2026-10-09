import http from 'node:http';
import {fileURLToPath} from 'node:url';

export function localRequest(path, body, model='qwen3.5-9b') {
  const common={model,temperature:0.7,top_p:0.8,top_k:20,min_p:0,chat_template_kwargs:{enable_thinking:false}};
  if(path==='/api/alpha/decisions') {
    const question=body.questions?.action, choices=Object.keys(question?.criteria||{});
    if(!choices.length||choices.some(k=>!/^a\d+$/.test(k)))throw Error('Invalid action candidates');
    return {...common,max_tokens:48,messages:[
      {role:'system',content:question.instructions+' Return only JSON {"action":"candidate ID"}. Choose only from the offered IDs. The current stage and live observations take priority over an outdated plan. preparationBeds are existing village beds to collect, never beds to place.'},
      {role:'user',content:JSON.stringify({state:JSON.parse(body.state),actions:question.criteria})}
    ],response_format:{type:'json_object',schema:{type:'object',properties:{action:{type:'string',enum:choices}},required:['action'],additionalProperties:false}}};
  }
  if(path==='/api/v1/chat/completions') {
    const number={type:'integer',minimum:0,maximum:64};
    return {...common,max_tokens:512,messages:body.messages.map(m=>m.role==='system'?{...m,content:m.content+' You are Qwen, serving both planner and action selector. preparationBeds are EXISTING village beds to mine and collect, not placements. The first surveyed chest supplies an iron pickaxe; do not mine iron ore or craft another pickaxe. Give one immediate objective. targets must contain only numeric minimum kit counts with keys beds, obsidian, navigationBlocks, iron_pickaxe, flint_and_steel. Keep notes short.'}:m),response_format:{type:'json_object',schema:{type:'object',properties:{objective:{type:'string',minLength:1,maxLength:160},targets:{type:'object',properties:Object.fromEntries(['beds','obsidian','navigationBlocks','iron_pickaxe','flint_and_steel'].map(k=>[k,number])),additionalProperties:false},waypoint:{anyOf:[{type:'null'},{type:'object',properties:{x:{type:'number'},y:{type:'number'},z:{type:'number'}},required:['x','y','z'],additionalProperties:false}]},notes:{type:'string',maxLength:240}},required:['objective','targets','waypoint','notes'],additionalProperties:false}}};
  }
  throw Error('Unsupported model endpoint');
}

export function translateResponse(path, original, response, model) {
  if(response.error)throw Error(response.error.message||String(response.error));
  if(response.choices?.[0]?.finish_reason!=='stop')throw Error('Incomplete local model response');
  const content=response.choices[0].message?.content;
  const parsed=JSON.parse(content);
  if(path==='/api/alpha/decisions') {
    if(!Object.hasOwn(original.questions.action.criteria,parsed.action))throw Error('Invalid local action');
    return {id:response.id,model,usage:response.usage,answers:{action:{choice:parsed.action}},localRequest:response.localRequest};
  }
  if(typeof parsed.objective!=='string'||!parsed.objective.trim()||!parsed.targets||Object.values(parsed.targets).some(n=>!Number.isInteger(n)||n<0))throw Error('Invalid local plan');
  if(parsed.waypoint!==null&&(!parsed.waypoint||['x','y','z'].some(k=>!Number.isFinite(parsed.waypoint[k]))))throw Error('Invalid local waypoint');
  return {...response,model};
}

export function startRelay({port=3099,base='http://127.0.0.1:8081/v1',model='qwen3.5-9b',fetchImpl=fetch}={}) {
  const target=new URL(base);if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw Error('Qwen endpoint must be local');
  let queue=Promise.resolve();
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.method!=='POST')throw Error('POST required');
      let input='';for await(const chunk of req){input+=chunk;if(input.length>2_000_000)throw Error('Request too large');}
      const {path,body}=JSON.parse(input), request=localRequest(path,body,model);
      const work=queue.then(async()=>{
        const started=Date.now();
        const response=await fetchImpl(base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(110000)});
        const data=await response.json();if(!response.ok)throw Error(`Local model HTTP ${response.status}: ${data.error?.message||'request failed'}`);
        const translated=translateResponse(path,body,{...data,localRequest:request},model);
        return {data:translated,latencyMs:Date.now()-started};
      });
      queue=work.catch(()=>{});
      const result=await work;
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
    } catch(error) {if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Local Qwen relay ready on ${port}; model ${model}`));
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))startRelay({port:Number(process.env.RELAY_PORT||3099),base:process.env.QWEN_BASE_URL||'http://127.0.0.1:8081/v1',model:process.env.PLANNER_MODEL||'qwen3.5-9b'});
