const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const WORLD_W = 540;
const WORLD_H = 52;
const TILE = 24;
const blocks = {
  air: { name: 'Air', solid: false },
  grass: { name: 'Grass', solid: true, color: '#79a850', top: '#b6d56a' },
  dirt: { name: 'Dirt', solid: true, color: '#9a6849', top: '#b47b51' },
  stone: { name: 'Stone', solid: true, color: '#738082', top: '#929e9c' },
  wood: { name: 'Wood', solid: true, color: '#9b663d', top: '#bd814c' },
  leaves: { name: 'Leaves', solid: true, color: '#3f7a4d', top: '#75a758' },
  coal: { name: 'Coal', solid: true, color: '#48565a', top: '#28363a' }
};
const hotbarItems = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'coal'];
const backpackItems = [...hotbarItems, 'sticks', 'planks'];
const miningHitsRequired = { grass: 1, leaves: 2, wood: 5, stone: 10 };
const inventory = { grass: 8, dirt: 8, stone: 0, wood: 0, leaves: 0, coal: 0, sticks: 0, planks: 0 };
const recipes = { sticks: 'WOOD STICKS', planks: 'WOOD PLANKS' };
const itemNames = { sticks: 'Wood Sticks', planks: 'Wood Planks' };
let craftingOpen = false;
let world = [], surface = [], seed = 0, selected = 0, day = 1;
let viewWidth = 0, viewHeight = 0, cameraX = 0, cameraY = 0, lastTime = 0, hintTimer;
const miningProgress = new Map();
const keys = {};
const player = { x: 0, y: 0, width: 0.7, height: 1.7, vx: 0, vy: 0, grounded: false, facing: 1, animationTime: 0 };

function seededRandom() {
  let value = seed;
  return () => { value = (value * 9301 + 49297) % 233280; return value / 233280; };
}
function generateWorld() {
  seed = Math.floor(Math.random() * 9000) + 1000;
  const random = seededRandom();
  world = Array.from({ length: WORLD_H }, () => Array(WORLD_W).fill('air'));
  surface = [];
  let height = 23;
  for (let x = 0; x < WORLD_W; x += 1) {
    height += Math.floor(random() * 3) - 1;
    height = Math.max(17, Math.min(28, height));
    surface[x] = height;
    for (let y = height; y < WORLD_H; y += 1) {
      world[y][x] = y === height ? 'grass' : y < height + 4 ? 'dirt' : random() < 0.1 ? 'coal' : 'stone';
    }
  }
  for (let x = 7; x < WORLD_W - 6; x += 1) {
    if (random() > 0.88 && Math.abs(surface[x] - surface[x - 1]) < 2) {
      const trunk = 3 + Math.floor(random() * 2);
      for (let y = surface[x] - 1; y >= surface[x] - trunk; y -= 1) world[y][x] = 'wood';
      for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 0; dy += 1) {
        const leafX = x + dx, leafY = surface[x] - trunk + dy;
        if (leafX > 0 && leafX < WORLD_W && leafY > 0 && random() > 0.15) world[leafY][leafX] = 'leaves';
      }
    }
  }
  player.x = 14; player.y = surface[14] - player.height - .05; player.vx = 0; player.vy = 0;
  player.facing = 1; player.animationTime = 0;
  miningProgress.clear();
  Object.keys(inventory).forEach(item => { inventory[item] = item === 'grass' || item === 'dirt' ? 8 : 0; });
  document.querySelector('#seed-value').textContent = seed;
  day += 1; document.querySelector('#day-count').textContent = String(day).padStart(2, '0');
  showToast('NEW FIELD GENERATED');
}
function resize() { const rect = canvas.getBoundingClientRect(); const scale = window.devicePixelRatio || 1; viewWidth = rect.width; viewHeight = rect.height; canvas.width = rect.width * scale; canvas.height = rect.height * scale; ctx.setTransform(scale, 0, 0, scale, 0, 0); }
function isSolidAt(x, y) { const bx = Math.floor(x), by = Math.floor(y); return bx < 0 || bx >= WORLD_W || by >= WORLD_H || (by >= 0 && blocks[world[by]?.[bx] || 'air'].solid); }
function collides(x, y) { return isSolidAt(x + .08, y + .08) || isSolidAt(x + player.width - .08, y + .08) || isSolidAt(x + .08, y + player.height - .03) || isSolidAt(x + player.width - .08, y + player.height - .03); }
function update(dt) {
  const left = keys.a || keys.arrowleft, right = keys.d || keys.arrowright;
  if (left && !right) player.facing = -1;
  if (right && !left) player.facing = 1;
  player.vx += ((right ? 5 : 0) - (left ? 5 : 0) - player.vx) * Math.min(1, dt * 12);
  player.vy = Math.min(player.vy + 18 * dt, 16);
  const nextX = player.x + player.vx * dt;
  if (!collides(nextX, player.y)) player.x = Math.max(0, Math.min(WORLD_W - player.width, nextX)); else player.vx = 0;
  const nextY = player.y + player.vy * dt;
  player.grounded = false;
  if (!collides(player.x, nextY)) player.y = nextY;
  else { if (player.vy > 0) player.grounded = true; player.vy = 0; }
  player.animationTime += dt;
  cameraX += (player.x * TILE - viewWidth / 2 - cameraX) * Math.min(1, dt * 5);
  cameraY += (player.y * TILE - viewHeight * .52 - cameraY) * Math.min(1, dt * 5);
  cameraX = Math.max(0, Math.min(WORLD_W * TILE - viewWidth, cameraX)); cameraY = Math.max(0, Math.min(WORLD_H * TILE - viewHeight, cameraY));
  updateReadout();
}
function drawBlock(type, x, y, size = TILE) {
  const block = blocks[type]; if (!block || type === 'air') return;
  ctx.fillStyle = block.color; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = block.top; ctx.fillRect(x, y, size, Math.max(3, size * .16));
  ctx.fillStyle = 'rgba(20,35,33,.12)'; ctx.fillRect(x, y + size * .78, size, size * .22);
  if (type === 'coal') { ctx.fillStyle = '#263436'; ctx.fillRect(x + size*.25, y + size*.37, size*.2, size*.2); ctx.fillRect(x + size*.65, y + size*.62, size*.15, size*.18); }
  if (type === 'wood') { ctx.fillStyle = '#6d4934'; ctx.fillRect(x + size*.42, y, size*.14, size); }
  ctx.strokeStyle = 'rgba(23,35,35,.11)'; ctx.strokeRect(x + .5, y + .5, size - 1, size - 1);
}
function drawMiningCracks(x, y, type) {
  const hits = miningProgress.get(`${Math.floor((x + cameraX) / TILE)},${Math.floor((y + cameraY) / TILE)}`) || 0;
  const requiredHits = miningHitsRequired[type] || 1;
  if (!hits || requiredHits <= 1) return;
  const progress = Math.min(1, hits / requiredHits);
  ctx.save();
  ctx.strokeStyle = `rgba(20, 27, 27, ${0.35 + progress * 0.45})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + TILE * .52, y + TILE * .08); ctx.lineTo(x + TILE * .42, y + TILE * .42); ctx.lineTo(x + TILE * .66, y + TILE * .58);
  if (progress > .25) { ctx.moveTo(x + TILE * .42, y + TILE * .42); ctx.lineTo(x + TILE * .18, y + TILE * .72); }
  if (progress > .5) { ctx.moveTo(x + TILE * .66, y + TILE * .58); ctx.lineTo(x + TILE * .84, y + TILE * .84); }
  if (progress > .75) { ctx.moveTo(x + TILE * .66, y + TILE * .58); ctx.lineTo(x + TILE * .56, y + TILE * .9); }
  ctx.stroke();
  ctx.restore();
}
function drawPlayer(x, y) {
  const width = player.width * TILE, height = player.height * TILE;
  const moving = Math.abs(player.vx) > .2;
  const jumping = !player.grounded;
  const walk = moving ? Math.sin(player.animationTime * 13) : 0;
  const bob = moving && player.grounded ? Math.abs(Math.sin(player.animationTime * 13)) * 1.2 : 0;
  const skin = '#e4b273', skinLight = '#f3ca8a', shirt = '#bd6747', shirtShadow = '#934b3b';
  const pants = '#314c61', pantsShadow = '#233746', hair = '#172323';
  const center = x + width / 2, headY = y + 2 - (jumping ? 1 : bob);
  const legSwing = jumping ? 3 : walk * 4, armSwing = jumping ? 0 : walk * 3;

  ctx.save();
  ctx.translate(center, 0);
  ctx.scale(player.facing, 1);
  ctx.translate(-center, 0);
  ctx.fillStyle = 'rgba(23,35,35,.18)';
  ctx.fillRect(x + 3, y + height - 1, width - 6, 3);

  ctx.fillStyle = shirtShadow;
  ctx.fillRect(x + 2, headY + TILE * .74 + armSwing, 4, TILE * .62);
  ctx.fillStyle = pantsShadow;
  ctx.fillRect(center - 5 - legSwing, y + TILE * 1.24, 5, TILE * .43);
  ctx.fillRect(center + 1 + legSwing, y + TILE * 1.24, 5, TILE * .43);
  ctx.fillStyle = pants;
  ctx.fillRect(center - 6 - legSwing, y + TILE * 1.2, 6, TILE * .42);
  ctx.fillRect(center + legSwing, y + TILE * 1.2, 6, TILE * .42);
  ctx.fillStyle = '#1d2b2b';
  ctx.fillRect(center - 7 - legSwing, y + TILE * 1.58, 7, 3);
  ctx.fillRect(center + legSwing, y + TILE * 1.58, 7, 3);

  ctx.fillStyle = shirt;
  ctx.fillRect(x + 3, headY + TILE * .68, width - 6, TILE * .62);
  ctx.fillStyle = shirtShadow;
  ctx.fillRect(x + 3, headY + TILE * 1.16, width - 6, 3);
  ctx.fillStyle = skin;
  ctx.fillRect(x + width - 5, headY + TILE * .75 - armSwing, 4, TILE * .58);
  ctx.fillStyle = skinLight;
  ctx.fillRect(x + width - 5, headY + TILE * .77 - armSwing, 2, TILE * .25);

  ctx.fillStyle = skin;
  ctx.fillRect(x + 3, headY + 2, width - 6, TILE * .65);
  ctx.fillStyle = skinLight;
  ctx.fillRect(x + 4, headY + 3, width * .45, TILE * .3);
  ctx.fillStyle = hair;
  ctx.fillRect(x + 3, headY + 1, width - 6, 5);
  ctx.fillRect(x + 3, headY + 5, 4, 7);
  ctx.fillStyle = '#263c3b';
  ctx.fillRect(x + (player.facing > 0 ? width - 9 : 5), headY + 9, 4, 4);
  ctx.fillStyle = '#fff1ca';
  ctx.fillRect(x + (player.facing > 0 ? width - 8 : 5), headY + 9, 2, 2);
  ctx.fillStyle = '#8e493b';
  ctx.fillRect(x + (player.facing > 0 ? width - 8 : 5), headY + 17, 4, 2);
  ctx.restore();
}
function render() {
  ctx.clearRect(0, 0, viewWidth, viewHeight); ctx.fillStyle = '#b8dfe1'; ctx.fillRect(0, 0, viewWidth, viewHeight);
  ctx.fillStyle = 'rgba(255,247,200,.8)'; ctx.beginPath(); ctx.arc(viewWidth*.78, viewHeight*.2, 30, 0, Math.PI*2); ctx.fill();
  const startX = Math.max(0, Math.floor(cameraX / TILE) - 1), endX = Math.min(WORLD_W, Math.ceil((cameraX + viewWidth) / TILE) + 1), startY = Math.max(0, Math.floor(cameraY / TILE) - 1), endY = Math.min(WORLD_H, Math.ceil((cameraY + viewHeight) / TILE) + 1);
  for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) { drawBlock(world[y][x], x*TILE-cameraX, y*TILE-cameraY); drawMiningCracks(x*TILE-cameraX, y*TILE-cameraY, world[y][x]); }
  const px = player.x*TILE-cameraX, py = player.y*TILE-cameraY;
  drawPlayer(px, py);
}
function loop(time) { const dt = Math.min(.033, (time-lastTime)/1000 || 0); lastTime = time; update(dt); render(); requestAnimationFrame(loop); }
function screenToTile(event) { const rect = canvas.getBoundingClientRect(); return { x: Math.floor((event.clientX - rect.left + cameraX) / TILE), y: Math.floor((event.clientY - rect.top + cameraY) / TILE) }; }
function inReach(x, y) { return Math.hypot(x + .5 - (player.x + .35), y + .5 - (player.y + .8)) < 3; }
function interact(event) { event.preventDefault(); const { x, y } = screenToTile(event); if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H || !inReach(x, y)) return showToast('TOO FAR AWAY'); const target = `${x},${y}`; if (event.button === 2) { const type = hotbarItems[selected]; if (world[y][x] === 'air' && inventory[type] > 0 && !collides(x, y)) { world[y][x] = type; inventory[type] -= 1; showToast(`PLACED ${blocks[type].name.toUpperCase()}`); } } else if (world[y][x] !== 'air') { const type = world[y][x]; const hits = (miningProgress.get(target) || 0) + 1; miningProgress.set(target, hits); const requiredHits = miningHitsRequired[type] || 1; if (hits < requiredHits) { showToast(`${blocks[type].name.toUpperCase()} ${hits} / ${requiredHits}`); } else { world[y][x] = 'air'; miningProgress.delete(target); if (type !== 'grass' || inventory.grass < 24) inventory[type] += 1; showToast(`MINED ${blocks[type].name.toUpperCase()}`); } } updateInventory(); }
function blockIcon(type) { return `<i class="block-icon" style="background:${blocks[type].color};box-shadow:inset 0 4px ${blocks[type].top}, inset 0 -5px rgba(20,35,33,.12)"></i>`; }
function itemIcon(type) { return blocks[type] ? blockIcon(type) : `<i class="block-icon crafted-icon ${type}"></i>`; }
function itemName(type) { return blocks[type]?.name || itemNames[type]; }
function updateCrafting() { document.querySelectorAll('.recipe').forEach(button => { button.disabled = inventory.wood < 5; }); }
function craft(item) { if (!recipes[item] || inventory.wood < 5) return showToast('NEED 5 WOOD'); inventory.wood -= 5; inventory[item] += 1; updateInventory(); showToast(`CRAFTED ${recipes[item]}`); }
function updateInventory() { const total = Object.values(inventory).reduce((a,b) => a+b, 0); document.querySelector('#inventory-total').textContent = `${total} items`; document.querySelector('#inventory').innerHTML = backpackItems.filter(item => inventory[item] > 0).map(item => `<div class="item" title="${itemName(item)}">${itemIcon(item)}<span class="item-label">${itemName(item)}</span><b>${inventory[item]}</b></div>`).join(''); document.querySelector('#hotbar').innerHTML = hotbarItems.map((item, index) => `<button class="slot ${index === selected ? 'active' : ''}" data-slot="${index}" title="${blocks[item].name}"><span>0${index+1}</span>${blockIcon(item)}<b>${inventory[item]}</b></button>`).join(''); updateCrafting(); }
function updateReadout() { document.querySelector('#coordinates').textContent = `${String(Math.floor(player.x)).padStart(3,'0')}, ${String(Math.floor(player.y)).padStart(3,'0')}`; document.querySelector('#altitude').textContent = player.grounded ? 'SURFACE' : player.vy < 0 ? 'RISING' : 'FALLING'; const logs = inventory.wood; document.querySelector('#objective-count').textContent = `${Math.min(logs,8)} / 8 logs`; document.querySelector('#progress-bar').style.width = `${Math.min(100, logs/8*100)}%`; document.querySelector('#objective-text').textContent = logs >= 8 ? 'Crafting is unlocked' : 'Gather wood to begin'; }
function showToast(text) { const toast = document.querySelector('#toast'); toast.textContent = text; toast.classList.add('visible'); clearTimeout(hintTimer); hintTimer = setTimeout(() => toast.classList.remove('visible'), 1300); }
window.addEventListener('keydown', event => { keys[event.key.toLowerCase()] = true; if (event.code === 'Space') { event.preventDefault(); if (player.grounded) player.vy = -8; } if (/^[1-6]$/.test(event.key)) { selected = Number(event.key)-1; updateInventory(); } });
window.addEventListener('keyup', event => { keys[event.key.toLowerCase()] = false; });
canvas.addEventListener('click', interact); canvas.addEventListener('contextmenu', event => { event.preventDefault(); interact(event); });
document.querySelector('#hotbar').addEventListener('click', event => { const slot = event.target.closest('.slot'); if (slot) { selected = Number(slot.dataset.slot); updateInventory(); } });
document.querySelector('#craft-toggle').addEventListener('click', event => { craftingOpen = !craftingOpen; const menu = document.querySelector('#crafting-menu'); menu.hidden = !craftingOpen; event.currentTarget.setAttribute('aria-expanded', String(craftingOpen)); event.currentTarget.querySelector('span').textContent = craftingOpen ? '−' : '+'; });
document.querySelector('#crafting-menu').addEventListener('click', event => { const recipe = event.target.closest('.recipe'); if (recipe) craft(recipe.dataset.recipe); });
document.querySelector('#reset-world').addEventListener('click', generateWorld); window.addEventListener('resize', resize);
resize(); generateWorld(); updateInventory(); requestAnimationFrame(loop);
