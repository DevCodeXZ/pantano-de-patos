import * as THREE from 'three';
import { buildWorld, heightAt, WATER_Y, clamp } from './world.js';
import { DuckManager } from './duck.js';
import { Dog } from './dog.js';
import { Player } from './player.js';
import { Chest, UPG, cost, STAT, SELL_PER_DUCK } from './chest.js';
import { Boss } from './bosses.js';
import { SFX } from './audio.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'pantano_patos_v1';
const BOSS_EVERY = 15 * 60; // 15 minutos por día

// ---------------------------------------------------------------- estado
const G = {
  playing: false, paused: false,
  day: 1, plumas: 0, carried: 0, totalKills: 0,
  lvls: { dmg: 0, reload: 0, mag: 0, dogCap: 0, dogSpd: 0, dogAuto: 0 },
};
let bossTimer = BOSS_EVERY;
let boss = null;
let slowTO = null;
let chestOpen = false;

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
const world = buildWorld(scene);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!IS_TOUCH) {
  for (const id of ['btnFire', 'btnReload', 'joyZone', 'lookZone']) $(id).style.display = 'none';
}

// ---------------------------------------------------------------- API interna
const api = {
  sfx, toast,
  playerPos: () => player.pos.clone(),
  isPlaying: () => G.playing && !G.paused && !chestOpen && !player.dead,
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
  interact: () => { if (!G.playing || G.paused) return; if (nearChest()) openChest(); },
};

// caja y perro
const chest = new Chest(scene, new THREE.Vector3(0, Math.max(heightAt(0, 4.5), 0) + 0.1, 4.5), sfx);
const dog = new Dog(scene, new THREE.Vector3(2.1, Math.max(heightAt(2.1, 3.4), 0) + 0.05, 3.4), sfx);

const ducks = new DuckManager(scene, sfx);
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
      v: 1, day: G.day, plumas: G.plumas, carried: G.carried,
      stored: chest.stored, lvls: G.lvls, totalKills: G.totalKills,
    }));
  } catch (e) { /* almacenamiento no disponible */ }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
function applyStats() {
  player.setStats(STAT.dmg(G.lvls.dmg), STAT.mag(G.lvls.mag), STAT.reload(G.lvls.reload));
  dog.setStats(STAT.dogCap(G.lvls.dogCap), STAT.dogSpd(G.lvls.dogSpd), G.lvls.dogAuto > 0);
  ducks.day = G.day;
}
function newGame() {
  G.day = 1; G.plumas = 0; G.carried = 0; G.totalKills = 0;
  G.lvls = { dmg: 0, reload: 0, mag: 0, dogCap: 0, dogSpd: 0, dogAuto: 0 };
  chest.stored = 0;
  bossTimer = BOSS_EVERY;
  if (boss) { boss.cleanup(); boss = null; $('bossBar').style.display = 'none'; }
  ducks.clear();
  player.respawn();
  applyStats();
  startPlaying();
  toast('🌱 Día 1 — ¡a cazar patos!');
}
function continueGame() {
  const s = loadSave();
  if (!s) return newGame();
  G.day = s.day || 1; G.plumas = s.plumas || 0; G.carried = s.carried || 0;
  G.totalKills = s.totalKills || 0;
  G.lvls = Object.assign({ dmg: 0, reload: 0, mag: 0, dogCap: 0, dogSpd: 0, dogAuto: 0 }, s.lvls);
  chest.stored = s.stored || 0;
  bossTimer = BOSS_EVERY;
  if (boss) { boss.cleanup(); boss = null; $('bossBar').style.display = 'none'; }
  ducks.clear();
  player.respawn();
  applyStats();
  startPlaying();
  toast(`🐦 Día ${G.day} — bienvenido de vuelta, Atenea`);
}
function startPlaying() {
  G.playing = true; G.paused = false;
  $('menu').style.display = 'none';
  $('pause').style.display = 'none';
  $('hud').style.display = 'block';
  save();
}

// ---------------------------------------------------------------- disparo con asistencia
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function resolveShot() {
  camera.getWorldDirection(_fwd);
  let best = null, bestAng = 1;
  // patos
  for (const d of ducks.ducks) {
    if (!d.shootable() || d.hp <= 0) continue;
    _to.copy(d.pos); _to.y += 0.3; _to.sub(player.pos);
    const dist = _to.length();
    if (dist > 110) continue;
    const ang = _fwd.angleTo(_to.normalize());
    const maxAng = (dist < 35 ? 0.115 : 0.08) + 0.55 / dist;
    if (ang < maxAng && ang < bestAng) { bestAng = ang; best = { kind: 'duck', d }; }
  }
  // clones y jefe
  if (boss && !boss.dead) {
    for (const c of boss.clones) {
      _to.copy(c.group.position).sub(player.pos);
      const dist = _to.length();
      const ang = _fwd.angleTo(_to.normalize());
      const maxAng = Math.atan2(3.2, dist) + 0.01;
      if (ang < maxAng && ang < bestAng) { bestAng = ang; best = { kind: 'clone', point: c.group.position.clone() }; }
    }
    _to.copy(boss.pos).sub(player.pos);
    const dist = _to.length();
    const ang = _fwd.angleTo(_to.normalize());
    const maxAng = Math.max(Math.atan2(boss.hitR, dist) * 1.15, 0.05);
    if (ang < maxAng && ang < bestAng) { bestAng = ang; best = { kind: 'boss' }; }
  }
  const cross = $('cross');
  if (best) {
    cross.classList.add('hit');
    setTimeout(() => cross.classList.remove('hit'), 120);
    if (best.kind === 'duck') {
      const killed = best.d.hit(player.dmg, sfx);
      ducks.burst(best.d.pos, 6, 0xfff3d0);
      if (killed) {
        G.plumas += 2;
        G.totalKills++;
        ducks.burst(best.d.pos, 10, 0xffe9a8);
        sfx.feather();
      }
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
    const rc = new THREE.Raycaster(camera.getWorldPosition(new THREE.Vector3()), _fwd, 0, 120);
    const hit = rc.intersectObject(world.terrain)[0];
    if (hit) ducks.burst(hit.point, 4, 0x9a8a6a);
  }
}

// ---------------------------------------------------------------- caja UI
function nearChest() {
  const dx = player.pos.x - chest.pos.x, dz = player.pos.z - chest.pos.z;
  return Math.hypot(dx, dz) < 5.5;
}
function openChest() {
  chestOpen = true;
  $('chest').style.display = 'flex';
  chest.buildUI(ui);
  chest.refreshUI(G.lvls, G.plumas, G.carried, chest.stored);
  document.exitPointerLock?.();
}
function closeChest() {
  chestOpen = false;
  $('chest').style.display = 'none';
}
const ui = {
  buy(id) {
    const lvl = G.lvls[id] || 0;
    if (lvl >= UPG[id].max) return;
    const c = cost(id, lvl);
    if (G.plumas < c) { sfx.deny(); return; }
    G.plumas -= c;
    G.lvls[id] = lvl + 1;
    applyStats();
    sfx.buy();
    chest.refreshUI(G.lvls, G.plumas, G.carried, chest.stored);
    save();
  },
  storeCarried() {
    if (G.carried <= 0) return;
    chest.stored += G.carried;
    toast(`📥 Guardaste ${G.carried} pato(s) en la caja`);
    G.carried = 0;
    sfx.pickup();
    chest.refreshUI(G.lvls, G.plumas, G.carried, chest.stored);
    save();
  },
  sellAll() {
    if (chest.stored <= 0) return;
    const gain = chest.stored * SELL_PER_DUCK;
    G.plumas += gain;
    toast(`💰 Vendiste ${chest.stored} patos por ${gain} plumas`);
    chest.stored = 0;
    sfx.coin();
    chest.refreshUI(G.lvls, G.plumas, G.carried, chest.stored);
    save();
  },
};

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
  $('pause').style.display = 'flex';
  document.exitPointerLock?.();
};
$('btnResume').onclick = () => { G.paused = false; $('pause').style.display = 'none'; };
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
$('btnRespawn').onclick = () => {
  G.plumas = Math.floor(G.plumas * 0.9);
  $('death').style.display = 'none';
  player.respawn();
  save();
};
// pestañas de la caja
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.tabPage').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    $('page' + t.dataset.tab[0].toUpperCase() + t.dataset.tab.slice(1)).classList.add('on');
  };
});
// botón CAJA (móvil)
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
  if (G.playing && !G.paused && !player.dead && !chestOpen) {
    world.update(dt);
    player.update(dt);
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
  updateHUD();
  renderer.render(scene, camera);
}
function updateHUD() {
  $('chipPlumas').textContent = `🪶 ${G.plumas}`;
  $('chipPatos').textContent = `🎒 ${G.carried} · 📦 ${chest.stored}`;
  $('chipDia').textContent = `Día ${G.day}`;
  $('chipBossTimer').textContent = boss
    ? '⚔️ ¡JEFE EN COMBATE!'
    : `⚔️ Jefe en ${fmt(Math.max(0, bossTimer))}`;
  $('ammo').textContent = player.reloading ? '⏳ recargando...' : `${player.ammo} / ${player.magSize}`;
  $('ammo').className = (player.ammo <= 1 && !player.reloading) ? 'low' : '';
  $('hpFill').style.width = (player.hp / player.maxHp * 100) + '%';
  // interacción con la caja
  const nc = nearChest() && G.playing && !chestOpen;
  $('btnChest').style.display = (nc && IS_TOUCH) ? 'flex' : 'none';
  const pr = $('prompt');
  if (nc) { pr.style.display = 'block'; pr.textContent = '📦 Abrir caja (E)'; }
  else pr.style.display = 'none';
}
// manija de depuración/pruebas
window.__pantano = { G, player, dog, chest, ducks, sfx, api, spawnBoss, openChest, get boss() { return boss; }, set boss(b) { boss = b; } };
loop();
