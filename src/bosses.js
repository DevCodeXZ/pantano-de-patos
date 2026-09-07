import * as THREE from 'three';
import { heightAt, WATER_Y, rand, clamp } from './world.js';
import { buildDuckMesh } from './duck.js';

export const BOSS_TYPES = [
  { name: 'PATOTRON TRICÉFALO', emoji: '🐲', scale: 7, heads: 3, colors: { body: 0x7a4f2a, head: 0x8f3b2a, beak: 0xd97b2a, wing: 0x9a6b3f }, abilities: ['fireball', 'fireball', 'storm'] },
  { name: 'PATITO DORADO', emoji: '👑', scale: 6.5, crown: true, colors: { body: 0xd8a825, head: 0xf0c040, beak: 0xffe08a, wing: 0xc09020 }, abilities: ['storm', 'fireball', 'shock'] },
  { name: 'PATO DE ÁCIDO', emoji: '🧪', scale: 7, colors: { body: 0x4a7d2a, head: 0x6ab03a, beak: 0xb0e050, wing: 0x558d33 }, abilities: ['acid', 'meteor', 'acid'] },
  { name: 'PATO GÉLIDO', emoji: '❄️', scale: 7, colors: { body: 0x9fc8dd, head: 0xc8e8f5, beak: 0x6a9ab5, wing: 0x7fb8d0 }, abilities: ['ice', 'ice', 'shock'] },
  { name: 'PATO SOMBRÍO', emoji: '🌑', scale: 7, colors: { body: 0x2a2a3a, head: 0x3a3a55, beak: 0x8080a0, wing: 0x35354a }, abilities: ['teleport', 'fireball', 'laser'] },
  { name: 'PATO VOLCÁNICO', emoji: '🌋', scale: 7.5, colors: { body: 0x5a2a20, head: 0x8a3a25, beak: 0xff7b2a, wing: 0x6e352a }, abilities: ['meteor', 'fireball', 'shock'] },
  { name: 'PATO ELÉCTRICO', emoji: '⚡', scale: 6.5, colors: { body: 0xd8c825, head: 0xf5e860, beak: 0xfffb9a, wing: 0xc0b030 }, abilities: ['laser', 'laser', 'storm'] },
  { name: 'PATO COLOSAL', emoji: '🪨', scale: 9, colors: { body: 0x6a6a62, head: 0x8a8a80, beak: 0xd0c8a0, wing: 0x7a7a70 }, abilities: ['shock', 'shock', 'meteor'] },
  { name: 'PATO ESPEJO', emoji: '🪞', scale: 6.5, colors: { body: 0xb8c8d8, head: 0xd8e8f8, beak: 0x8aa0b5, wing: 0xa0b8c8 }, abilities: ['clones', 'storm', 'laser'] },
  { name: 'EL REY PATO', emoji: '🎩', scale: 8.5, crown: true, heads: 1, colors: { body: 0x3a5a8a, head: 0x507ab0, beak: 0xe8b83a, wing: 0x4468a0 }, abilities: ['fireball', 'laser', 'shock', 'storm', 'meteor'] },
];

const UP = new THREE.Vector3(0, 1, 0);

export class Boss {
  constructor(scene, day, sfx) {
    this.scene = scene;
    this.sfx = sfx;
    this.day = day;
    this.type = BOSS_TYPES[(day - 1) % BOSS_TYPES.length];
    this.maxHp = 700 + day * 260;
    this.hp = this.maxHp;
    this.reward = 900 + day * 160;
    this.dead = false;

    const m = buildDuckMesh(this.type.colors);
    this.group = m.group; this.body = m.body; this.wingL = m.wingL; this.wingR = m.wingR;
    this.group.scale.setScalar(this.type.scale);
    this.hitR = this.type.scale * 1.5;

    // cabezas extra / corona
    if (this.type.heads === 3) {
      for (const dx of [-0.55, 0.55]) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), new THREE.MeshLambertMaterial({ color: this.type.colors.head }));
        h.position.set(dx, 0.62, 0.3);
        this.group.add(h);
        const bk = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 5), new THREE.MeshLambertMaterial({ color: this.type.colors.beak }));
        bk.rotation.x = Math.PI / 2; bk.position.set(dx, 0.58, 0.62);
        this.group.add(bk);
      }
    }
    if (this.type.crown) {
      const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x554400 }));
      cr.position.set(0, 0.95, 0.3);
      this.group.add(cr);
    }
    // posición inicial: entra volando desde el borde
    const a = rand(0, Math.PI * 2);
    this.orbitA = a;
    this.orbitR = 30;
    this.alt = 13;
    this.group.position.set(Math.cos(a) * 30, this.alt, Math.sin(a) * 30);
    this.t = 0;
    this.atkCd = 3;
    this.atkIdx = 0;
    this.flashT = 0;
    this.state = 'hover';      // hover | swoop | rise
    this.projectiles = [];
    this.telegraphs = [];
    this.clones = [];
    this.quackCd = 3;
    scene.add(this.group);
    this.ring = null;
    this.sfx.roar();
  }
  get pos() { return this.group.position; }
  shootable() { return !this.dead; }
  setBar(api) { api.setBossBar(this.type.emoji + ' ' + this.type.name, this.hp / this.maxHp); }

  hit(dmg, api) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flashT = 0.1;
    this.setBar(api);
    if (this.hp <= 0) { this.die(api); return true; }
    this.sfx.bosshit();
    return false;
  }
  die(api) {
    this.dead = true;
    this.sfx.bossdie();
    api.featherBurst(this.pos, 60, 0xffe08a);
    api.onBossDefeated(this.reward);
    this.cleanup();
    this.scene.remove(this.group);
  }
  cleanup() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const tg of this.telegraphs) this.scene.remove(tg.mesh);
    for (const c of this.clones) this.scene.remove(c.group);
    if (this.ring) { this.scene.remove(this.ring.mesh); this.ring = null; }
    this.projectiles = []; this.telegraphs = []; this.clones = [];
  }
  removeProjectile(p) {
    this.scene.remove(p.mesh);
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  shoot(kind, targetPos, speed, dmg, color, r = 0.5) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 6, 5),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(this.pos);
    const vel = targetPos.clone().sub(this.pos).normalize().multiplyScalar(speed);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vel, dmg, ttl: 6, kind });
  }

  doAbility(name, api, playerPos) {
    switch (name) {
      case 'fireball':
        this.shoot('ball', playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)), 15, 16, 0xff7b2a, 0.7);
        this.sfx.quack(true, true);
        break;
      case 'acid':
        this.shoot('ball', playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)), 12, 15, 0x9ae04a, 0.8);
        break;
      case 'ice':
        this.shoot('ice', playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)), 13, 12, 0xbfe8ff, 0.6);
        break;
      case 'storm': {
        const dir0 = playerPos.clone().sub(this.pos); dir0.y = 0; dir0.normalize();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(10);
          d.y = -1.2;
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
          mesh.position.copy(this.pos);
          this.scene.add(mesh);
          this.projectiles.push({ mesh, vel: d, dmg: 10, ttl: 5, kind: 'ball' });
        }
        this.sfx.quack(true, false);
        break;
      }
      case 'laser': {
        // telegrafo 0.8s -> rayo 0.4s
        const target = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
        const from = this.pos.clone();
        const len = from.distanceTo(target);
        const tGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6);
        const mesh = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.45 }));
        mesh.scale.y = len;
        _orientBeam(mesh, from, target);
        this.scene.add(mesh);
        this.telegraphs.push({ mesh, t: 0.8, total: 0.8, kind: 'laser', from, target, fired: false });
        this.sfx.osc && this.sfx.osc('sawtooth', 800, 200, 0.7, 0.12);
        break;
      }
      case 'meteor': {
        for (let i = 0; i < 3; i++) {
          const tp = playerPos.clone().add(new THREE.Vector3(rand(-7, 7), 0, rand(-7, 7)));
          tp.y = Math.max(heightAt(tp.x, tp.z), WATER_Y) + 0.1;
          const mesh = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 6, 18), new THREE.MeshBasicMaterial({ color: 0xff5522 }));
          mesh.rotation.x = Math.PI / 2;
          mesh.position.copy(tp);
          this.scene.add(mesh);
          this.telegraphs.push({ mesh, t: 1.1 + i * 0.35, total: 1.1 + i * 0.35, kind: 'meteor', target: tp, r: 3.2, dmg: 22 });
        }
        break;
      }
      case 'shock':
        if (this.state === 'hover') { this.state = 'swoop'; this.swoopT = 1.2; }
        break;
      case 'teleport': {
        api.featherBurst(this.pos, 14, 0x555577);
        this.orbitA += Math.PI * rand(0.6, 1.2);
        this.pos.set(Math.cos(this.orbitA) * this.orbitR, this.alt, Math.sin(this.orbitA) * this.orbitR);
        api.featherBurst(this.pos, 14, 0x555577);
        break;
      }
      case 'clones': {
        if (this.clones.length === 0) {
          for (let i = 0; i < 2; i++) {
            const cm = buildDuckMesh(this.type.colors);
            const g = cm.group;
            g.scale.setScalar(2.4);
            g.position.copy(this.pos).add(new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8)));
            this.scene.add(g);
            this.clones.push({ group: g, hp: 140, shootCd: rand(2, 4), wingL: cm.wingL, wingR: cm.wingR, t: rand(0, 9) });
          }
          api.toast('🪞 ¡Clones! Busca al original');
        }
        break;
      }
    }
  }

  update(dt, playerPos, api) {
    if (this.dead) return;
    this.t += dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.body.material.emissive.setScalar(Math.max(0, this.flashT * 6));
    }
    const flap = Math.sin(this.t * 9) * 0.55;
    this.wingL.rotation.z = flap + 0.15;
    this.wingR.rotation.z = -flap - 0.15;
    this.quackCd -= dt;
    if (this.quackCd <= 0) { this.sfx.quack(true, Math.random() < 0.5); this.quackCd = rand(3, 6); }

    // movimiento
    if (this.state === 'hover') {
      this.orbitA += dt * 0.22;
      const tx = Math.cos(this.orbitA) * this.orbitR;
      const tz = Math.sin(this.orbitA) * this.orbitR;
      this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 2);
      this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 2);
      this.pos.y += (this.alt + Math.sin(this.t * 0.8) * 2 - this.pos.y) * Math.min(1, dt * 2);
    } else if (this.state === 'swoop') {
      this.swoopT -= dt;
      const gy = Math.max(heightAt(this.pos.x, this.pos.z), WATER_Y) + this.type.scale * 0.8;
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 3.5);
      if (this.swoopT <= 0) {
        // onda expansiva
        this.ring = { mesh: new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffbb66 })), R: 1, hitDone: false };
        this.ring.mesh.rotation.x = Math.PI / 2;
        this.ring.mesh.position.set(this.pos.x, Math.max(heightAt(this.pos.x, this.pos.z), WATER_Y) + 0.4, this.pos.z);
        this.scene.add(this.ring.mesh);
        this.sfx.thud();
        this.state = 'rise';
        this.riseT = 1.6;
      }
    } else if (this.state === 'rise') {
      this.riseT -= dt;
      if (this.riseT <= 0.4) this.pos.y += dt * 9;
      if (this.riseT <= 0) this.state = 'hover';
    }
    // mirar al jugador
    _look.copy(playerPos);
    this.group.lookAt(_look.x, this.pos.y, _look.z);

    // ataques
    this.atkCd -= dt;
    if (this.atkCd <= 0 && this.state === 'hover') {
      const ab = this.type.abilities[this.atkIdx % this.type.abilities.length];
      this.atkIdx++;
      this.doAbility(ab, api, playerPos);
      this.atkCd = rand(2.4, 3.4) - Math.min(1, this.day * 0.02);
    }

    // clones
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.t += dt;
      const fl = Math.sin(c.t * 10) * 0.6;
      c.wingL.rotation.z = fl; c.wingR.rotation.z = -fl;
      c.group.position.y = this.alt - 2 + Math.sin(c.t) * 1.5;
      c.shootCd -= dt;
      if (c.shootCd <= 0) {
        c.shootCd = 3.5;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc8d8e8 }));
        mesh.position.copy(c.group.position);
        const vel = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(c.group.position).normalize().multiplyScalar(11);
        this.scene.add(mesh);
        this.projectiles.push({ mesh, vel, dmg: 8, ttl: 5, kind: 'ball' });
      }
    }

    // telegrafías
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i];
      tg.t -= dt;
      if (tg.kind === 'laser') {
        if (!tg.fired && tg.t <= 0) {
          tg.fired = true;
          tg.mesh.material.opacity = 0.95;
          tg.mesh.scale.x = 4; tg.mesh.scale.z = 4; // rayo grueso
          // daño por distancia al segmento
          const d = distPointSeg(playerPos, tg.from, tg.target);
          if (d < 2.4) api.damagePlayer(24);
        } else if (tg.fired && tg.t <= -0.4) {
          this.scene.remove(tg.mesh);
          this.telegraphs.splice(i, 1);
          continue;
        }
      } else if (tg.kind === 'meteor') {
        const pulse = 1 + Math.sin(this.t * 14) * 0.15;
        tg.mesh.scale.setScalar(pulse);
        if (tg.t <= 0) {
          // meteorito cae
          const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 6), new THREE.MeshBasicMaterial({ color: 0xff6622 }));
          m.position.copy(tg.target).add(new THREE.Vector3(0, 30, 0));
          this.scene.add(m);
          this.projectiles.push({ mesh: m, vel: new THREE.Vector3(0, -38, 0), dmg: 0, ttl: 1.2, kind: 'meteorSplash', splash: tg });
          this.scene.remove(tg.mesh);
          this.telegraphs.splice(i, 1);
          continue;
        }
      }
    }

    // onda expansiva
    if (this.ring) {
      this.ring.R += dt * 16;
      this.ring.mesh.scale.setScalar(this.ring.R);
      const pd = Math.hypot(playerPos.x - this.ring.mesh.position.x, playerPos.z - this.ring.mesh.position.z);
      if (!this.ring.hitDone && Math.abs(pd - this.ring.R) < 1.9) {
        this.ring.hitDone = true;
        api.damagePlayer(18);
      }
      if (this.ring.R > 18) { this.scene.remove(this.ring.mesh); this.ring = null; }
    }

    // proyectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      let remove = p.ttl <= 0;
      if (p.kind === 'meteorSplash') {
        if (p.mesh.position.y <= p.splash.target.y + 0.3) {
          const d = playerPos.distanceTo(p.splash.target);
          if (d < p.splash.r) api.damagePlayer(p.splash.dmg);
          api.featherBurst(p.splash.target, 12, 0xff8844);
          remove = true;
        }
      } else if (p.kind === 'ice') {
        if (p.mesh.position.distanceTo(playerPos) < 1.9) {
          api.damagePlayer(p.dmg);
          api.slowPlayer(2.5);
          remove = true;
        }
      } else {
        if (p.mesh.position.distanceTo(playerPos.clone().add(new THREE.Vector3(0, 1.2, 0))) < 1.9) {
          api.damagePlayer(p.dmg);
          remove = true;
        }
      }
      if (remove) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
  // los clones pueden recibir daño desde fuera
  hitClone(point, dmg, api) {
    for (let i = 0; i < this.clones.length; i++) {
      const c = this.clones[i];
      if (point.distanceTo(c.group.position) < 3.4) {
        c.hp -= dmg;
        if (c.hp <= 0) {
          api.featherBurst(c.group.position, 16, 0xffffff);
          api.addPlumas(30);
          api.toast('🪞 +30 plumas (clon)');
          this.scene.remove(c.group);
          this.clones.splice(i, 1);
        }
        return true;
      }
    }
    return false;
  }
}
const _look = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function _orientBeam(mesh, from, target) {
  const dir = target.clone().sub(from);
  const mid = from.clone().add(target).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
}
export function distPointSeg(p, a, b) {
  _v1.copy(b).sub(a);
  _v2.copy(p).sub(a);
  const t = clamp(_v2.dot(_v1) / _v1.lengthSq(), 0, 1);
  return p.distanceTo(_v1.multiplyScalar(t).add(a));
}
