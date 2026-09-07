import * as THREE from 'three';
import { buildWorld, heightAt, WATER_Y, clamp } from './world.js';
import { DuckManager } from './duck.js';
import { Dog } from './dog.js';
import { Player, CHEST_POS } from './player.js';
import { Chest, SELL_PER_DUCK } from './chest.js';
import { Boss } from './bosses.js';
import { SFX } from './audio.js';
import { buildLobby } from './lobby.js';
import { WEAPONS, DOGS, weaponById, dogById, RARITY } from './shop.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'pantano_patos_v1';
const BOSS_EVERY = 15 * 60; // 15 minutos por día

// ---------------------------------------------------------------- estado
const G = {
  playing: false, paused: false,
  mode: 'lobby',                       // 'lobby' (campamento) | 'hunt' (pantano)
  day: 1, plumas: 0, carried: 0, totalKills: 0,
  ownedW: ['rustico'], ownedD: ['firulais'],
  weapon: 'rustico', dog: 'firulais',
};
let bossTimer = BOSS_EVERY;
let boss = null;
let slowTO = null;
let chestOpen = false;
let shopOpen = false;

// ---------------------------------------------------------------- three
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 420);
scene.add(camera);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const sfx = new SFX();

// dos mundos en grupos: el campamento (lobby) y el pantano (caza)
const swampGroup = new THREE.Group();
const lobbyGroup = new THREE.Group();
scene.add(swampGroup, lobbyGroup);
const world = buildWorld(swampGroup);
const lobby = buildLobby(lobbyGroup);
const SWAMP_SKY = { bg: swampGroup.background, fog: swampGroup.fog };
const LOBBY_SKY = { bg: lobbyGroup.background, fog: lobbyGroup.fog };

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!IS_TOUCH) {
  for (const id of ['btnFire', 'btnReload', 'btnSprint', 'joyZone', 'lookZone']) $(id).style.display = 'none';
}

// ---------------------------------------------------------------- API interna
const api = {
  sfx, toast,
  mode: () => G.mode,
  playerPos: () => player.pos.clone(),
  isPlaying: () => G.playing && !G.paused && !chestOpen && !shopOpen && !player.dead,
  damagePlayer: n => player.takeDamage(n),
  slowPlayer: t => {
    player.speed = 4.2;
    clearTimeout(slowTO);
    slowTO = setTimeout(() => player.speed = 8, t * 1000);
  },
  featherBurst: (p, n, c) => ducks.burst(p, n, c),
  groundDucks: () => ducks.groundDucks(),
  addPlumas: n => { G.plumas += n; },
  onDuckGrounded: () => {},
  onDogGrabbed: () => {},
  storeFromDog: n => { chest.stored += n; toast(`📦 +${n} pato(s) guardados por el perro`); save(); },
  giveCarriedFromDog: n => { G.carried += n; toast(`🎒 Recogiste ${n} pato(s) del perro`); },
  onHurt: () => {
    const v = $('vign');
    v.style.opacity = 1;
    setTimeout(() => v.style.opacity = 0, 150);
  },
  onPlayerDead: () => {
    const lost = Math.floor(G.plumas * 0.1);
    $('deathSub').textContent = lost > 0
      ? `Los patos te dejaron mareado... pierdes ${lost} plumas. Tu progreso del día se mantiene.`
      : 'Los patos te dejaron mareado... Tu progreso del día se mantiene.';
    $('death').style.display = 'flex';
    document.exitPointerLock?.();
  },
  setBossBar: (name, frac) => {
    $('bossBar').style.display = 'block';
    $('bossName').textContent = name;
    $('bossFill').style.width = (frac * 100).toFixed(1) + '%';
  },
  onBossDefeated: reward => {
    G.plumas += reward;
    showBanner(`🏆 ¡${boss.type.name} derrotado!`, `+${reward} plumas — comienza el día ${G.day + 1}`);
    $('bossBar').style.display = 'none';
    boss = null;
    bossTimer = BOSS_EVERY;
    G.day++;
    ducks.day = G.day;
    save();
    sfx.coin();
  },
  onShot: () => resolveShot(),
  interact: () => {
    if (!G.playing || G.paused || chestOpen || shopOpen || player.dead) return;
    if (G.mode === 'lobby') lobbyInteract();
    else if (nearChest()) openChest();
  },
};

// caja y perro (viven en el pantano, junto al campamento de caza)
const groundAt = (x, z) => Math.max(heightAt(x, z), WATER_Y + 0.25);
const chest = new Chest(swampGroup, new THREE.Vector3(CHEST_POS.x, groundAt(CHEST_POS.x, CHEST_POS.z) + 0.1, CHEST_POS.z), sfx);

let dog = null;
function createDog() {
  if (dog) dog.remove();
  const d = dogById(G.dog);
  const dx = CHEST_POS.x + 2.5, dz = CHEST_POS.z - 1.5;
  dog = new Dog(swampGroup, new THREE.Vector3(dx, groundAt(dx, dz) + 0.05, dz), sfx, d);
}

const ducks = new DuckManager(swampGroup, sfx);
const player = new Player(camera, canvas, sfx, api);

// ---------------------------------------------------------------- helpers UI
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2700);
}
function showBanner(title, sub, ms = 3200) {
  const b = $('banner');
  b.querySelector('h2').textContent = title;
  b.querySelector('p').textContent = sub;
  b.style.display = 'block';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.style.display = 'none', ms);
}
function fmt(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ---------------------------------------------------------------- guardado
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2, day: G.day, plumas: G.plumas, carried: G.carried,
      stored: chest.stored, totalKills: G.totalKills,
      ownedW: G.ownedW, ownedD: G.ownedD, weapon: G.weapon, dog: G.dog,
    }));
  } catch (e) { /* almacenamiento no disponible */ }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
function applyLoadout() {
  player.setWeapon(weaponById(G.weapon));
  createDog();
  ducks.day = G.day;
}
function newGame() {
  G.day = 1; G.plumas = 0; G.carried = 0; G.totalKills = 0;
  G.ownedW = ['rustico']; G.ownedD = ['firulais'];
  G.weapon = 'rustico'; G.dog = 'firulais';
  chest.stored = 0;
  bossTimer = BOSS_EVERY;
  if (boss) { boss.cleanup(); boss = null; $('bossBar').style.display = 'none'; }
  ducks.clear();
  applyLoadout();
  setMode('lobby');
  startPlaying();
  toast('🏕️ Campamento — compra mejoras y habla con el cazador para partir');
}
function continueGame() {
  const s = loadSave();
  if (!s) return newGame();
  G.day = s.day || 1; G.plumas = s.plumas || 0; G.carried = s.carried || 0;
  G.totalKills = s.totalKills || 0;
  G.ownedW = Array.isArray(s.ownedW) && s.ownedW.length ? s.ownedW : ['rustico'];
  G.ownedD = Array.isArray(s.ownedD) && s.ownedD.length ? s.ownedD : ['firulais'];
  G.weapon = G.ownedW.includes(s.weapon) ? s.weapon : G.ownedW[0];
  G.dog = G.ownedD.includes(s.dog) ? s.dog : G.ownedD[0];
  chest.stored = s.stored || 0;
  bossTimer = BOSS_EVERY;
  if (boss) { boss.cleanup(); boss = null; $('bossBar').style.display = 'none'; }
  ducks.clear();
  applyLoadout();
  setMode('lobby');
  startPlaying();
  toast(`🏕️ Día ${G.day} — bienvenido de vuelta, Atenea`);
}
function startPlaying() {
  G.playing = true; G.paused = false;
  $('menu').style.display = 'none';
  $('pause').style.display = 'none';
  $('hud').style.display = 'block';
  save();
}

// ---------------------------------------------------------------- cambio de mundo
function setMode(m) {
  G.mode = m;
  const inLobby = m === 'lobby';
  swampGroup.visible = !inLobby;
  lobbyGroup.visible = inLobby;
  scene.background = inLobby ? LOBBY_SKY.bg : SWAMP_SKY.bg;
  scene.fog = inLobby ? LOBBY_SKY.fog : SWAMP_SKY.fog;
  if (inLobby) player.toLobby(); else player.respawn();
}
function gotoHunt() {
  if (G.mode !== 'lobby') return;
  setMode('hunt');
  ducks.day = G.day;
  showBanner(`🌅 Día ${G.day}`, '¡A cazar! El jefe llega en 15:00');
  sfx.bark?.();
  save();
}
function gotoLobby() {
  if (G.mode !== 'hunt') return;
  if (boss) { toast('⚔️ ¡No puedes huir del jefe!'); return; }
  ducks.clear();
  setMode('lobby');
  toast('🏕️ De vuelta al campamento — vende, compra y vuelve a cazar');
  save();
}

// ---------------------------------------------------------------- disparo con asistencia
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function resolveShot() {
  // en el campamento no hay caza: el disparo solo asusta a los patos del estanque
  if (G.mode === 'lobby') {
    if (lobby.scare() > 0) { sfx.quack(); toast('🦆 ¡Los patos salieron volando!'); }
    return;
  }
  camera.getWorldDirection(_fwd);
  const w = player.weapon || {};
  const shots = w.pellets || 1;
  for (let s = 0; s < shots; s++) {
    const dir = _fwd.clone();
    if (shots > 1) {
      dir.x += (Math.random() - 0.5) * 0.06;
      dir.y += (Math.random() - 0.5) * 0.05;
      dir.z += (Math.random() - 0.5) * 0.06;
      dir.normalize();
    }
    shootRay(dir, w);
  }
}
function shootRay(dir, w) {
  let best = null, bestAng = 1;
  // patos (ordenados por ángulo, para penetración)
  const duckHits = [];
  for (const d of ducks.ducks) {
    if (!d.shootable() || d.hp <= 0) continue;
    _to.copy(d.pos); _to.y += 0.3; _to.sub(player.pos);
    const dist = _to.length();
    if (dist > 110) continue;
    const ang = dir.angleTo(_to.normalize());
    const maxAng = (dist < 35 ? 0.115 : 0.08) + 0.55 / dist;
    if (ang < maxAng) duckHits.push({ ang, d });
  }
  duckHits.sort((a, b) => a.ang - b.ang);
  if (duckHits.length) { best = { kind: 'duck' }; bestAng = duckHits[0].ang; }
  // clones y jefe
  if (boss && !boss.dead) {
    for (const c of boss.clones) {
      _to.copy(c.group.position).sub(player.pos);
      const dist = _to.length();
      const ang = dir.angleTo(_to.normalize());
      const maxAng = Math.atan2(3.2, dist) + 0.01;
      if (ang < maxAng && ang < bestAng) { bestAng = ang; best = { kind: 'clone', point: c.group.position.clone() }; }
    }
    _to.copy(boss.pos).sub(player.pos);
    const dist = _to.length();
    const ang = dir.angleTo(_to.normalize());
    const maxAng = Math.max(Math.atan2(boss.hitR, dist) * 1.15, 0.05);
    if (ang < maxAng && ang < bestAng) { bestAng = ang; best = { kind: 'boss' }; }
  }
  const cross = $('cross');
  if (best) {
    cross.classList.add('hit');
    setTimeout(() => cross.classList.remove('hit'), 120);
    if (best.kind === 'duck') {
      const n = Math.min(1 + (w.pierce || 0), duckHits.length);
      for (let i = 0; i < n; i++) killDuck(duckHits[i].d, w);
    } else if (best.kind === 'clone') {
      boss.hitClone(best.point, player.dmg, api);
      ducks.burst(best.point, 5, 0xffffff);
    } else if (best.kind === 'boss') {
      const bpos = boss.pos.clone();
      boss.hit(player.dmg, api);
      ducks.burst(bpos, 6, 0xffe08a);
    }
  } else {
    // impacto en el suelo: polvo
    const rc = new THREE.Raycaster(camera.getWorldPosition(new THREE.Vector3()), dir, 0, 120);
    const hit = rc.intersectObject(world.terrain)[0];
    if (hit) ducks.burst(hit.point, 4, 0x9a8a6a);
  }
}
function killDuck(d, w) {
  const killed = d.hit(player.dmg, sfx);
  ducks.burst(d.pos, 6, 0xfff3d0);
  if (!killed) return;
  G.plumas += 2;
  G.totalKills++;
  ducks.burst(d.pos, 10, 0xffe9a8);
  sfx.feather();
  if (w.splash) {
    for (const o of ducks.ducks) {
      if (o === d || !o.shootable() || o.hp <= 0) continue;
      if (o.pos.distanceTo(d.pos) <= w.splash && o.hit(Math.max(1, player.dmg * 0.5), sfx)) {
        G.plumas += 2;
        G.totalKills++;
        ducks.burst(o.pos, 8, 0xffe9a8);
      }
    }
  }
}

// ---------------------------------------------------------------- caja UI (pantano)
function nearChest() {
  const dx = player.pos.x - chest.pos.x, dz = player.pos.z - chest.pos.z;
  return Math.hypot(dx, dz) < 5.5;
}
function openChest() {
  chestOpen = true;
  $('chest').style.display = 'flex';
  chest.buildUI();
  chest.refreshUI(G.plumas, G.carried, chest.stored);
  document.exitPointerLock?.();
}
function closeChest() {
  chestOpen = false;
  $('chest').style.display = 'none';
}
const ui = {
  storeCarried() {
    if (G.carried <= 0) return;
    chest.stored += G.carried;
    toast(`📥 Guardaste ${G.carried} pato(s) en la caja`);
    G.carried = 0;
    sfx.pickup();
    chest.refreshUI(G.plumas, G.carried, chest.stored);
    save();
  },
  sellAll() {
    if (chest.stored <= 0) return;
    const gain = chest.stored * SELL_PER_DUCK;
    G.plumas += gain;
    toast(`💰 Vendiste ${chest.stored} patos por ${gain} plumas`);
    chest.stored = 0;
    sfx.coin();
    chest.refreshUI(G.plumas, G.carried, chest.stored);
    save();
  },
};
// chest.js conecta sus botones vía window.__pantanoUI
window.__pantanoUI = ui;

// ---------------------------------------------------------------- tienda UI (campamento)
let shopTab = 'armas';
function openShop(tab) {
  shopOpen = true;
  shopTab = tab;
  $('shopTitle').textContent = tab === 'armas' ? '🔫 Armería del pantano' : '🐕 Perrería "Patas Felices"';
  document.querySelectorAll('#shop .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  document.querySelectorAll('#shop .tabPage').forEach(p => p.classList.toggle('on', p.dataset.page === tab));
  buildShop();
  refreshShop();
  $('shop').style.display = 'flex';
  document.exitPointerLock?.();
}
function closeShop() {
  shopOpen = false;
  $('shop').style.display = 'none';
}
function buildShop() {
  $('shopArmas').innerHTML = WEAPONS.map(w => {
    const r = RARITY[w.rarity];
    const perks = [
      w.pellets ? `${w.pellets} postas por disparo` : '',
      w.pierce ? `atraviesa ${w.pierce} patos` : '',
      w.splash ? 'daño en área' : '',
    ].filter(Boolean).join(' · ');
    return `<div class="upRow">
      <div class="upInfo">
        <b style="color:${r.color}">${w.name}</b> <span class="lvlDots" style="color:${r.color}">✦ ${r.label}</span>
        <small>${w.desc}${perks ? '<br>' + perks : ''}<br>Daño ${w.dmg} · ${w.interval}s por disparo · Cargador ${w.mag} · Recarga ${w.reload}s</small>
      </div>
      <button class="upBuy" data-kind="w" data-id="${w.id}"></button>
    </div>`;
  }).join('');
  $('shopPerros').innerHTML = DOGS.map(d => {
    const r = RARITY[d.rarity];
    return `<div class="upRow">
      <div class="upInfo">
        <b style="color:${r.color}">${d.name}</b> <span class="lvlDots" style="color:${r.color}">✦ ${r.label}</span>
        <small>${d.perk}<br>Lleva ${d.cap} pato(s) por viaje · velocidad ${d.spd}${d.auto ? ' · guarda solo' : ''}</small>
      </div>
      <button class="upBuy" data-kind="d" data-id="${d.id}"></button>
    </div>`;
  }).join('');
  document.querySelectorAll('#shop .upBuy').forEach(b => {
    b.onclick = () => shopAction(b.dataset.kind, b.dataset.id);
  });
}
function refreshShop() {
  $('shopWallet').textContent = `🪶 ${G.plumas} plumas`;
  document.querySelectorAll('#shop .upBuy').forEach(b => {
    const kind = b.dataset.kind, id = b.dataset.id;
    const def = kind === 'w' ? weaponById(id) : dogById(id);
    const owned = (kind === 'w' ? G.ownedW : G.ownedD).includes(id);
    const inUse = (kind === 'w' ? G.weapon : G.dog) === id;
    b.classList.toggle('max', inUse);
    if (inUse) { b.textContent = '✔ En uso'; b.disabled = true; }
    else if (owned) { b.textContent = 'Usar'; b.disabled = false; }
    else {
      b.textContent = `🪶 ${def.price}`;
      b.disabled = G.plumas < def.price;
    }
  });
}
function shopAction(kind, id) {
  const isW = kind === 'w';
  const def = isW ? weaponById(id) : dogById(id);
  const owned = (isW ? G.ownedW : G.ownedD).includes(id);
  if (!owned && G.plumas < def.price) { sfx.deny(); toast('🪶 Te faltan plumas...'); return; }
  if (!owned) {
    G.plumas -= def.price;
    if (isW) G.ownedW.push(id); else G.ownedD.push(id);
    toast(isW ? `🔫 ¡Compraste ${def.name}!` : `🐕 ¡${def.name} se une al equipo!`);
    sfx.buy();
  }
  if (isW) { G.weapon = id; player.setWeapon(weaponById(id)); }
  else { G.dog = id; createDog(); }
  refreshShop();
  save();
}

// ---------------------------------------------------------------- campamento: interacciones
function nearestLobbySpot() {
  let best = null, bd = 1e9;
  for (const it of lobby.interactables) {
    const d = Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z);
    if (d < it.r && d < bd) { bd = d; best = it; }
  }
  return best;
}
function lobbyInteract() {
  const it = nearestLobbySpot();
  if (!it) return;
  if (it.id === 'armas') openShop('armas');
  else if (it.id === 'perros') openShop('perros');
  else if (it.id === 'npc') gotoHunt();
}

// ---------------------------------------------------------------- jefes
function spawnBoss() {
  boss = new Boss(scene, G.day, sfx);
  boss.setBar(api);
  toast(`${boss.type.emoji} ¡${boss.type.name} ha llegado!`);
}

// ---------------------------------------------------------------- menús
$('btnNew').onclick = () => { sfx.ensure(); newGame(); };
$('btnContinue').onclick = () => { sfx.ensure(); continueGame(); };
$('btnPause').onclick = () => {
  if (!G.playing) return;
  G.paused = true;
  $('pauseStats').textContent = `Día ${G.day} · 🪶 ${G.plumas} plumas · 🦆 ${G.totalKills} patos cazados`;
  $('btnLobby').style.display = (G.mode === 'hunt' && !boss) ? 'block' : 'none';
  $('pause').style.display = 'flex';
  document.exitPointerLock?.();
};
$('btnResume').onclick = () => { G.paused = false; $('pause').style.display = 'none'; };
$('btnLobby').onclick = () => {
  G.paused = false;
  $('pause').style.display = 'none';
  gotoLobby();
};
$('btnSound').onclick = () => {
  sfx.setMuted(!sfx.muted);
  $('btnSound').textContent = sfx.muted ? '🔇 Sonido: apagado' : '🔊 Sonido: activado';
};
$('btnReset').onclick = () => {
  if (confirm('¿Seguro? Se borrará todo tu progreso.')) {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
};
$('btnChestClose').onclick = closeChest;
$('btnShopClose').onclick = closeShop;
$('btnRespawn').onclick = () => {
  G.plumas = Math.floor(G.plumas * 0.9);
  $('death').style.display = 'none';
  player.respawn();
  save();
};
// Escape también cierra los modales
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (chestOpen) closeChest();
    if (shopOpen) closeShop();
  }
});
// pestañas genéricas (tienda del campamento)
document.querySelectorAll('.tabs .tab').forEach(t => {
  t.onclick = () => {
    const panel = t.closest('.panel');
    panel.querySelectorAll('.tabs .tab').forEach(x => x.classList.toggle('on', x === t));
    panel.querySelectorAll('.tabPage').forEach(p => p.classList.toggle('on', p.dataset.page === t.dataset.tab));
  };
});
// botón contextual (CAJA / ARMERÍA / PERRERÍA / CAZAR) en móvil
$('btnChest').addEventListener('touchstart', e => { e.preventDefault(); api.interact(); }, { passive: false });
$('btnChest').addEventListener('mousedown', () => api.interact());

// continuar si hay partida guardada
{
  const s = loadSave();
  if (s && s.day) {
    $('btnContinue').style.display = 'block';
    $('btnContinue').textContent = `▶️ Continuar — Día ${s.day} · 🪶 ${s.plumas || 0}`;
  }
}

// ---------------------------------------------------------------- bucle
const clock = new THREE.Clock();
let saveT = 30;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.mode === 'lobby') lobby.update(dt);   // ambiente siempre vivo
  if (G.playing && !G.paused && !player.dead && !chestOpen && !shopOpen) {
    player.update(dt);
    if (G.mode === 'hunt') {
      world.update(dt);
      ducks.update(dt, player.pos, api);
      dog.update(dt, api);
      if (boss) boss.update(dt, player.pos, api);
      else {
        bossTimer -= dt;
        if (bossTimer <= 0) spawnBoss();
      }
      saveT -= dt;
      if (saveT <= 0) { saveT = 30; save(); }
    }
  }
  updateHUD();
  renderer.render(scene, camera);
}
function updateHUD() {
  const inLobby = G.mode === 'lobby';
  const combat = G.playing && !inLobby;
  $('chipPlumas').textContent = `🪶 ${G.plumas}`;
  $('chipDia').textContent = inLobby ? '🏕️ Campamento' : `Día ${G.day}`;
  $('chipPatos').style.display = combat ? 'block' : 'none';
  $('chipBossTimer').style.display = combat ? 'block' : 'none';
  $('cross').style.display = combat ? 'block' : 'none';
  $('ammo').style.display = combat ? 'block' : 'none';
  $('hpWrap').style.display = combat ? 'block' : 'none';
  if (IS_TOUCH) {
    $('btnFire').style.display = combat ? 'flex' : 'none';
    $('btnReload').style.display = combat ? 'flex' : 'none';
    $('btnSprint').style.display = combat ? 'flex' : 'none';
  }
  if (combat) {
    $('chipPatos').textContent = `🎒 ${G.carried} · 📦 ${chest.stored}`;
    $('chipBossTimer').textContent = boss
      ? '⚔️ ¡JEFE EN COMBATE!'
      : `⚔️ Jefe en ${fmt(Math.max(0, bossTimer))}`;
    $('ammo').textContent = player.reloading ? '⏳ recargando...' : `${player.ammo} / ${player.magSize}`;
    $('ammo').className = (player.ammo <= 1 && !player.reloading) ? 'low' : '';
    $('hpFill').style.width = (player.hp / player.maxHp * 100) + '%';
  }
  // interacción contextual
  let promptTxt = null, btnTxt = null;
  if (G.playing && !player.dead) {
    if (inLobby && !shopOpen) {
      const it = nearestLobbySpot();
      if (it) {
        if (it.id === 'armas') { promptTxt = '🔫 Armería — comprar armas (E)'; btnTxt = '🔫<span class="rlbl">ARMERÍA</span>'; }
        else if (it.id === 'perros') { promptTxt = '🐕 Perrería — adoptar perros (E)'; btnTxt = '🐕<span class="rlbl">PERRERÍA</span>'; }
        else { promptTxt = `🛶 Partir a cazar — Día ${G.day} (E)`; btnTxt = '🛶<span class="rlbl">CAZAR</span>'; }
      }
    } else if (combat && !chestOpen && nearChest()) {
      promptTxt = '📦 Abrir caja (E)';
      btnTxt = '📦<span class="rlbl">CAJA</span>';
    }
  }
  const showBtn = IS_TOUCH && btnTxt;
  $('btnChest').style.display = showBtn ? 'flex' : 'none';
  if (showBtn) $('btnChest').innerHTML = btnTxt;
  const pr = $('prompt');
  if (promptTxt) { pr.style.display = 'block'; pr.textContent = promptTxt; }
  else pr.style.display = 'none';
}
// manija de depuración/pruebas
window.__pantano = {
  G, player, chest, ducks, sfx, api,
  get dog() { return dog; },
  get boss() { return boss; }, set boss(b) { boss = b; },
  get world() { return world; },
  spawnBoss, openChest, openShop, closeShop, gotoHunt, gotoLobby, setMode,
};
// estado inicial: el menú se muestra sobre el campamento
setMode('lobby');
player.update(0.001);   // coloca la cámara para el fondo del menú
loop();
