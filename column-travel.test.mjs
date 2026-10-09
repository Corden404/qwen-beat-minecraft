import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3} from 'vec3';
import {checkedDescentLanding,descendColumn} from './column-travel.mjs';
function fixture(hazard=null){
 const bot={entity:{position:new Vec3(-59.5,71,57.5),onGround:true},pathfinder:{setGoal(){},bestHarvestTool:()=>({name:'iron_pickaxe'})},inventory:{items:()=>[]},clearControlStates(){},equip:async()=>{},waitForTicks:async()=>{},blockAt:p=>({position:p,name:p.y===69&&hazard?hazard:'netherrack',boundingBox:'block',diggable:true})};return bot;
}
test('checked descent rejects unknown landing and lava or magma',()=>{
 assert.equal(checkedDescentLanding(fixture()),true);
 assert.equal(checkedDescentLanding(fixture('magma_block')),false);
 const unknown=fixture();unknown.blockAt=()=>null;assert.equal(checkedDescentLanding(unknown),false);
 const lava=fixture(),original=lava.blockAt;lava.blockAt=p=>p.x===-59&&p.y===70?{...original(p),name:'lava',boundingBox:'empty'}:original(p);
 assert.equal(checkedDescentLanding(lava),false);
});
test('checked descent stops at its target and does not mine hazardous landing',async()=>{
 const bot=fixture();let mined=0;bot.dig=async()=>{mined++;bot.entity.position.y--;};
 assert.equal(await descendColumn(bot,66),'Descended 5 checked column blocks');assert.equal(mined,5);
 const hazardous=fixture('magma_block');hazardous.dig=async()=>assert.fail('unsafe mining');
 await assert.rejects(descendColumn(hazardous,66),/checked landing/);
});
