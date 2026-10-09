import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3} from 'vec3';
import {nearbyNavigationBlocks} from './mining-tools.mjs';

test('navigation search excludes the floor before applying the candidate limit',()=>{
 const feet=new Vec3(0,68,0),ground=Array.from({length:12},(_,x)=>({name:'stone',position:new Vec3(x-6,67,0)}));
 const side={name:'cobblestone',position:new Vec3(3,68,0)},head={name:'stone',position:new Vec3(0,69,0)},high={name:'stone',position:new Vec3(2,70,0)};
 const bot={entity:{position:feet},findBlocks:opts=>[...ground,head,high,side].filter(opts.matching).filter(opts.useExtraInfo).slice(0,opts.count).map(b=>b.position)};
 assert.deepEqual(nearbyNavigationBlocks(bot),[side.position]);
});
