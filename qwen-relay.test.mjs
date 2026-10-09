import test from 'node:test';
import assert from 'node:assert/strict';
import {localRequest,translateResponse,startRelay} from './qwen-relay.mjs';
import {once} from 'node:events';
const original={state:'{"stage":"prepare"}',questions:{action:{instructions:'Collect the required kit.',criteria:{a0:'Collect bed',a1:'Depart'}}}};
const response=content=>({id:'local',choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]});
test('local decisions constrain IDs and preserve JEV-compatible selected action',()=>{
  const request=localRequest('/api/alpha/decisions',original);
  assert.deepEqual(request.response_format.schema.properties.action.enum,['a0','a1']);
  assert.equal(request.chat_template_kwargs.enable_thinking,false);
  assert.equal(translateResponse('/api/alpha/decisions',original,response({action:'a1'}),'qwen3.5-9b').answers.action.choice,'a1');
});
test('invalid or truncated choices cannot become game actions',()=>{
  assert.throws(()=>translateResponse('/api/alpha/decisions',original,response({action:'a99'}),'qwen3.5-9b'),/Invalid local action/);
  const truncated=response({action:'a0'});truncated.choices[0].finish_reason='length';
  assert.throws(()=>translateResponse('/api/alpha/decisions',original,truncated,'qwen3.5-9b'),/Incomplete/);
});
test('planner rejects action names in numeric inventory targets',()=>{
  assert.throws(()=>translateResponse('/api/v1/chat/completions',{},response({objective:'Loot chest',targets:{action:'loot'},waypoint:null}),'qwen3.5-9b'),/Invalid local plan/);
  assert.throws(()=>translateResponse('/api/v1/chat/completions',{},response({objective:'Loot chest',targets:{beds:8},waypoint:{x:1,y:2}}),'qwen3.5-9b'),/waypoint/);
});
test('asynchronous invalid model output returns failure over HTTP',async()=>{
  const relay=startRelay({port:0,fetchImpl:async()=>({ok:true,json:async()=>response({action:'a99'})})});
  await once(relay,'listening');
  try {
    const result=await fetch('http://127.0.0.1:'+relay.address().port,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'/api/alpha/decisions',body:original})});
    assert.equal(result.status,502);
    assert.match((await result.json()).error,/Invalid local action/);
  } finally {await new Promise(resolve=>relay.close(resolve));}
});
