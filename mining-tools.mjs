// Preserve iron durability for gold and other blocks that require iron.
export function tunnelTool(bot,block){return bot.inventory.items().find(i=>i.name==='stone_pickaxe'&&(!block.harvestTools||block.harvestTools[i.type]))||bot.inventory.items().find(i=>i.name==='wooden_pickaxe'&&(!block.harvestTools||block.harvestTools[i.type]))||bot.pathfinder.bestHarvestTool(block);}
export function spareToolsReady(i){return !!(i.stone_axe||i.iron_axe||i.diamond_axe)&&(i.stone_pickaxe||0)>=3&&Object.entries(i).filter(([n])=>n.endsWith('_planks')).reduce((n,[,v])=>n+v,0)>=64&&(i.stick||0)>=16&&(i.cobblestone||0)>=48;}
export function nearbyNavigationBlocks(bot){
 const feet=bot.entity.position.floored();
 return bot.findBlocks({matching:b=>['stone','cobblestone','dirt','netherrack'].includes(b.name),maxDistance:10,count:2,
  useExtraInfo:b=>b.position.y>=feet.y&&b.position.y<=feet.y+1&&!(b.position.x===feet.x&&b.position.z===feet.z)});
}
