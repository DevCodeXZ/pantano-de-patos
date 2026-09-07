import * as THREE from 'three';
import { heightAt, WATER_Y, MAP_R, rand, clamp, mergeGeoms, M4 } from './world.js';

// pato mirando hacia +Z
export function buildDuckMesh(c) {
  const bodyGeo = mergeGeoms([
    [new THREE.SphereGeometry(0.62, 8, 6), M4(0, 0, 0, 0, 0, 0, 1), c.body],                 // cuerpo
    [new THREE.SphereGeometry(0.62, 8, 6), M4(0, 0.06, 0, 0, 0, 0, 1).scale(new THREE.Vector3(1, 0.8, 1.25)), c.body],
    [new THREE.SphereGeometry(0.3, 7, 5), M4(0, 0.5, 0.42, 0, 0, 0, 1), c.head],             // cabeza
    [new THREE.ConeGeometry(0.12, 0.32, 5), M4(0, 0.46, 0.78, Math.PI / 2, 0, 0, 1), c.beak],// pico
    [new THREE.SphereGeometry(0.06, 4, 3), M4(0.12, 0.55, 0.6, 0, 0, 0, 1), 0x111111],       // ojo
    [new THREE.SphereGeometry(0.06, 4, 3), M4(-0.12, 0.55, 0.6, 0, 0, 0, 1), 0x111111],
    [new THREE.ConeGeometry(0.05, 0.3, 4), M4(0, 0.72, -0.05, 0.5, 0, 0, 1), c.head],        // cresta
  ]);
  const wingGeoL = new THREE.BoxGeometry(0.95, 0.07, 0.5);
  wingGeoL.translate(-0.5, 0, 0);
  const wingGeoR = new THREE.BoxGeometry(0.95, 0.07, 0.5);
  wingGeoR.translate(0.5, 0, 0);
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(bodyGeo, mat);
  group.add(body);
  const wmL = new THREE.MeshLambertMaterial({ color: c.wing, side: THREE.DoubleSide });
  const wmR = new THREE.MeshLambertMaterial({ color: c.wing, side: THREE.DoubleSide });
  const wingL = new THREE.Mesh(wingGeoL, wmL); wingL.position.set(-0.05, 0.18, 0);
  const wingR = new THREE.Mesh(wingGeoR, wmR); wingR.position.set(0.05, 0.18, 0);
  group.add(wingL, wingR);
  return { group, body, wingL, wingR };
}

export const DUCK_COLORS = { body: 0x9a6b3f, head: 0x5a8f3c, beak: 0xe8a13a, wing: 0xb0875a };
export const ANGRY_TINT = new THREE.Color(0xff5540);
const WHITE = new THREE.Color(0xffffff);

let duckId = 0;
export class Duck {
  constructor(scene, kind, pos, dir, opts = {}) {
    this.id = ++duckId;
    this.kind = kind;               // 'fly' | 'angry'
    this.scene = scene;
    this.opts = opts;
    const colors = opts.colors || DUCK_COLORS;
    const m = buildDuckMesh(colors);
    this.group = m.group; this.body = m.body; this.wingL = m.wingL; this.wingR = m.wingR;
    this.scale = opts.scale || rand(0.9, 1.25);
    this.group.scale.setScalar(this.scale);
    this.hitR = 1.15 * this.scale;
    this.hp = opts.hp ?? 1;
    this.speed = opts.speed ?? rand(6.5, 10);
    this.baseY = pos.y;
    this.dir = dir.clone().normalize();
    this.group.position.copy(pos);
    this.t = rand(0, 10);
    this.state = 'fly';
    this.vy = 0;
    this.flashT = 0;
    this.attackCd = rand(1.5, 3);
    this.quackCd = rand(0.5, 2);
    this.fleeT = 0;
    this.dead = false;              // listo para eliminar
    this.carried = false;
    scene.add(this.group);
    if (kind === 'angry') this.setAngryLook();
  }
  setAngryLook() {
    this.body.material.color.copy(ANGRY_TINT);
    this.baseY = Math.min(this.baseY, 9);
  }
  get pos() { return this.group.position; }
  shootable() { return (this.state === 'fly' || this.state === 'dive' || this.state === 'flee'); }
  onGround() { return this.state === 'ground'; }

  hit(dmg, sfx) {
    if (!this.shootable() || this.hp <= 0) return false;
    this.hp -= dmg;
    this.flashT = 0.1;
    if (this.hp <= 0) {
      this.state = 'fall';
      this.vy = 1.5;
      this.spin = rand(3, 7) * (Math.random() < 0.5 ? -1 : 1);
      sfx.quack(false, false);
      return true; // muerto
    }
    sfx.quack(false, true);
    return false;
  }
  update(dt, playerPos, api) {
    this.t += dt;
    const p = this.pos;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.body.material.emissive.copy(WHITE).multiplyScalar(Math.max(0, this.flashT * 8));
    }
    // alas
    const flap = this.state === 'fall' ? 0.2 : Math.sin(this.t * 13) * 0.7;
    this.wingL.rotation.z = flap + 0.15;
    this.wingR.rotation.z = -flap - 0.15;

    if (this.state === 'fly' || this.state === 'flee') {
      p.addScaledVector(this.dir, this.speed * dt);
      p.y = this.baseY + Math.sin(this.t * 2.1) * 0.55;
      if (this.state === 'flee') { this.baseY += dt * 4; p.y = this.baseY; }
      this.group.lookAt(p.x + this.dir.x, p.y, p.z + this.dir.z);
      if (Math.hypot(p.x, p.z) > MAP_R + 14) this.despawn();
      // enfadados: entrar en picado
      if (this.kind === 'angry' && this.state === 'fly') {
        this.quackCd -= dt;
        if (this.quackCd <= 0) { api.sfx.quack(false, true); this.quackCd = rand(1.4, 2.6); }
        const d = p.distanceTo(playerPos);
        this.attackCd -= dt;
        if (d < 34 && this.attackCd <= 0) {
          this.state = 'dive';
          this.diveTarget = playerPos.clone().add(new THREE.Vector3(0, 1.4, 0));
        }
      }
    } else if (this.state === 'dive') {
      const to = this.diveTarget.clone().sub(p);
      const d = to.length();
      if (d < 1.6) {
        api.damagePlayer(this.opts.dmg ?? 8);
        api.sfx.quack(true, true);
        this.state = 'flee';
        this.fleeT = 2.5;
        this.dir = p.clone().sub(playerPos).setY(0).normalize();
        this.speed = 15;
      } else {
        p.addScaledVector(to.normalize(), 15 * dt);
        this.group.lookAt(this.diveTarget);
      }
    } else if (this.state === 'flee') {
      this.fleeT -= dt;
      if (this.fleeT <= 0) { this.state = 'fly'; this.attackCd = rand(3, 5); }
    } else if (this.state === 'fall') {
      this.vy -= 24 * dt;
      p.y += this.vy * dt;
      this.group.rotation.z += this.spin * dt;
      const g = heightAt(p.x, p.z);
      const floor = Math.max(g, WATER_Y) + 0.42 * this.scale;
      if (p.y <= floor) {
        p.y = floor;
        this.state = 'ground';
        this.groundT = 0;
        api.sfx.thud();
        api.onDuckGrounded(this);
      }
    } else if (this.state === 'ground') {
      this.groundT += dt;
      // flotar si cayó al agua
      const g = heightAt(p.x, p.z);
      if (g < WATER_Y) p.y = WATER_Y + 0.42 * this.scale + Math.sin(this.t * 2) * 0.06;
      if (this.groundT > 90) this.despawn(); // se pudre y desaparece
    }
  }
  despawn() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
  }
}

// partículas de plumas
class Feathers {
  constructor(scene) {
    this.count = 130;
    const geo = new THREE.PlaneGeometry(0.28, 0.16);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff3d0, side: THREE.DoubleSide }), this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = [];
    for (let i = 0; i < this.count; i++) {
      this.parts.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: rand(0, 6.28), rs: rand(-6, 6) });
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.next = 0;
    scene.add(this.mesh);
    this.hideAll();
  }
  hideAll() {
    const zero = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  burst(pos, n = 10, color = 0xfff3d0) {
    for (let i = 0; i < n; i++) {
      const f = this.parts[this.next];
      f.life = rand(0.8, 1.6);
      f.p.copy(pos).add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.2, 0.4), rand(-0.4, 0.4)));
      f.v.set(rand(-3, 3), rand(1, 4), rand(-3, 3));
      f.r = rand(0, 6.28);
      this.mesh.setColorAt(this.next, new THREE.Color(color));
      this.next = (this.next + 1) % this.count;
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const zero = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    let dirty = false;
    this.parts.forEach((f, i) => {
      if (f.life <= 0) return;
      f.life -= dt;
      f.v.y -= 4.5 * dt;
      f.v.multiplyScalar(1 - 0.9 * dt);
      f.p.addScaledVector(f.v, dt);
      f.r += f.rs * dt;
      if (f.life <= 0) { this.mesh.setMatrixAt(i, zero); dirty = true; return; }
      const s = Math.min(1, f.life);
      _fm.makeRotationZ(f.r);
      _fm.scale(new THREE.Vector3(s, s, s));
      _fm.setPosition(f.p);
      this.mesh.setMatrixAt(i, _fm);
      dirty = true;
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const _fm = new THREE.Matrix4();

export class DuckManager {
  constructor(scene, sfx) {
    this.scene = scene;
    this.sfx = sfx;
    this.ducks = [];
    this.feathers = new Feathers(scene);
    this.spawnCd = 4;
    this.waveCd = rand(75, 120);
    this.day = 1;
  }
  aliveFlying() { return this.ducks.filter(d => d.shootable()).length; }
  groundDucks() { return this.ducks.filter(d => d.onGround() && !d.carried && !d.claimed); }

  spawnFlight(n, opts = {}) {
    const fromEdge = Math.floor(rand(0, 4));
    const dirs = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ];
    const dir = opts.dir || dirs[fromEdge];
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const startXZ = new THREE.Vector3(-dir.x * (MAP_R + 8), 0, -dir.z * (MAP_R + 8));
    const lineOff = rand(-60, 60);
    const hp = opts.hp ?? (1 + Math.floor((this.day - 1) / 18));
    for (let i = 0; i < n; i++) {
      const off = lineOff + i * rand(3.5, 6) - n * 2;
      const pos = startXZ.clone()
        .addScaledVector(perp, off)
        .add(new THREE.Vector3(0, rand(8, 17) + i * rand(0.5, 1.4), 0));
      const kind = opts.angry ? 'angry' : 'fly';
      this.ducks.push(new Duck(this.scene, kind, pos, dir.clone(), {
        hp: opts.angry ? 2 + Math.floor(this.day / 12) : hp,
        speed: opts.angry ? rand(7, 9) : rand(6.5, 10),
        dmg: 8 + Math.floor(this.day / 8) * 2,
        colors: opts.angry ? { ...DUCK_COLORS, head: 0xcc3311, body: 0x993322 } : DUCK_COLORS,
      }));
    }
    if (!opts.angry) this.sfx.quack(false, false);
  }
  update(dt, playerPos, api) {
    // goteo constante de patos
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      this.spawnCd = rand(6, 11);
      if (this.aliveFlying() < 22) this.spawnFlight(Math.floor(rand(3, 7)));
    }
    // oleadas
    this.waveCd -= dt;
    if (this.waveCd <= 0) {
      this.waveCd = rand(80, 130);
      this.spawnFlight(Math.floor(rand(9, 14)));
      api.toast('⚠️ ¡Oleada de patos!');
      if (Math.random() < 0.4) {
        setTimeout(() => {
          if (!this.scene) return;
          this.spawnFlight(Math.floor(rand(4, 7)), { angry: true, dir: this.dirToPlayer(playerPos) });
          api.toast('😡 ¡Patos enfadados! ¡Cuidado!');
        }, 2500);
      }
    }
    for (const d of this.ducks) d.update(dt, playerPos, api);
    this.ducks = this.ducks.filter(d => !d.dead);
    this.feathers.update(dt);
  }
  dirToPlayer(playerPos) {
    const from = new THREE.Vector3(-playerPos.x, 0, -playerPos.z);
    if (from.length() < 5) from.set(1, 0, 0);
    return from.normalize();
  }
  burst(pos, n, color) { this.feathers.burst(pos, n, color); }
  clear() {
    for (const d of this.ducks) d.despawn();
    this.ducks = [];
  }
}
