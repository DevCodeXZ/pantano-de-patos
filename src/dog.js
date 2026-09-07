import * as THREE from 'three';
import { heightAt, rand, mergeGeoms, M4 } from './world.js';

// perro mirando hacia +Z
export function buildDogMesh() {
  const bodyGeo = mergeGeoms([
    [new THREE.BoxGeometry(0.55, 0.5, 1.05), M4(0, 0.52, 0, 0, 0, 0, 1), 0xb58a4f],
    [new THREE.BoxGeometry(0.42, 0.38, 0.4), M4(0, 0.86, 0.6, 0, 0, 0, 1), 0xb58a4f],          // cabeza
    [new THREE.BoxGeometry(0.2, 0.18, 0.22), M4(0, 0.78, 0.86, 0, 0, 0, 1), 0x8a6236],         // hocico
    [new THREE.BoxGeometry(0.1, 0.2, 0.06), M4(0.18, 1.08, 0.55, 0, 0, 0.3, 1), 0x6e4a2f],     // orejas
    [new THREE.BoxGeometry(0.1, 0.2, 0.06), M4(-0.18, 1.08, 0.55, 0, 0, -0.3, 1), 0x6e4a2f],
    [new THREE.SphereGeometry(0.045, 4, 3), M4(0.11, 0.92, 0.79, 0, 0, 0, 1), 0x111111],       // ojos
    [new THREE.SphereGeometry(0.045, 4, 3), M4(-0.11, 0.92, 0.79, 0, 0, 0, 1), 0x111111],
    [new THREE.BoxGeometry(0.58, 0.1, 0.16), M4(0, 0.62, 0.28, 0, 0, 0, 1), 0xd23b2f],         // collar
  ]);
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(bodyGeo, mat);
  group.add(body);
  const legGeo = new THREE.BoxGeometry(0.13, 0.42, 0.15);
  legGeo.translate(0, -0.21, 0);
  const legs = [];
  [[0.18, 0.38], [-0.18, 0.38], [0.18, -0.38], [-0.18, -0.38]].forEach(([x, z], i) => {
    const leg = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x9a7343 }));
    leg.position.set(x, 0.42, z);
    group.add(leg);
    legs.push(leg);
  });
  const tailGeo = new THREE.BoxGeometry(0.09, 0.09, 0.4);
  tailGeo.translate(0, 0, -0.2);
  const tail = new THREE.Mesh(tailGeo, new THREE.MeshLambertMaterial({ color: 0xb58a4f }));
  tail.position.set(0, 0.68, -0.52);
  group.add(tail);
  return { group, body, legs, tail };
}

// patito que el perro lleva en la boca
function miniDuck() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: DUCK_BODY });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), mat);
  b.scale.set(1, 0.8, 1.3);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshLambertMaterial({ color: 0x5a8f3c }));
  h.position.set(0, 0.18, 0.2);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), new THREE.MeshLambertMaterial({ color: 0xe8a13a }));
  bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.15, 0.35);
  g.add(b, h, bk);
  return g;
}
const DUCK_BODY = 0x9a6b3f;

export class Dog {
  constructor(scene, anchorPos, sfx) {
    this.scene = scene;
    this.sfx = sfx;
    this.anchor = anchorPos.clone(); // junto a la caja
    const m = buildDogMesh();
    this.group = m.group; this.legs = m.legs; this.tail = m.tail; this.body = m.body;
    this.group.position.copy(anchorPos);
    this.capacity = 1;
    this.speed = 6.5;
    this.autoStore = false;
    this.carried = 0;
    this.state = 'sit';
    this.t = rand(0, 10);
    this.target = null;
    this.heldMeshes = [];
    this.barkCd = 0;
    scene.add(this.group);
  }
  get pos() { return this.group.position; }
  setStats(capacity, speed, autoStore) {
    this.capacity = capacity; this.speed = speed; this.autoStore = autoStore;
  }
  attachDuckVisual() {
    const d = miniDuck();
    d.position.set(0, 0.72, 0.95);
    d.rotation.x = 0.4;
    this.group.add(d);
    this.heldMeshes.push(d);
  }
  clearHeldVisuals() {
    for (const m of this.heldMeshes) this.group.remove(m);
    this.heldMeshes = [];
  }
  deliver(api) {
    if (this.carried <= 0) return;
    if (this.autoStore) {
      api.storeFromDog(this.carried);
    }
    // si no es auto, espera a que el jugador se acerque (api revisa proximidad)
    this.carriedDelivered = !this.autoStore ? this.carried : 0;
    if (!this.autoStore) { /* mantiene los patos en el hocico */ }
    else { this.carried = 0; this.clearHeldVisuals(); }
  }
  update(dt, api) {
    this.t += dt;
    const p = this.pos;
    // cola siempre contenta
    this.tail.rotation.y = Math.sin(this.t * 9) * 0.55;
    this.barkCd -= dt;

    if (this.state === 'sit') {
      // esperar a que el jugador recoja lo que trae (modo manual)
      if (!this.autoStore && this.carried > 0) {
        if (p.distanceTo(api.playerPos()) < 3.2) {
          api.giveCarriedFromDog(this.carried);
          this.carried = 0;
          this.clearHeldVisuals();
          this.sfx.bark();
        }
      }
    }

    // buscar trabajo
    if (this.carried < this.capacity) {
      const ducks = api.groundDucks();
      if (ducks.length > 0) {
        if (this.state === 'sit' || this.state === 'return') {
          let best = null, bd = 1e9;
          for (const d of ducks) {
            if (d.claimed && d.claimed !== this) continue;
            const dist = p.distanceTo(d.pos);
            if (dist < bd) { bd = dist; best = d; }
          }
          if (best) {
            if (this.target && this.target !== best) this.target.claimed = null;
            this.target = best;
            best.claimed = this;
            this.state = 'go';
          }
        }
      }
    }

    if (this.state === 'go') {
      const d = this.target;
      if (!d || d.dead || d.state !== 'ground' || (d.claimed && d.claimed !== this)) {
        if (d && d.claimed === this) d.claimed = null;
        this.target = null;
        this.state = 'sit';
      } else {
        const to = d.pos.clone().sub(p); to.y = 0;
        const dist = to.length();
        if (dist < 1.2) {
          d.carried = true;
          d.despawn();
          this.carried++;
          this.attachDuckVisual();
          api.sfx.bark();
          api.sfx.pickup();
          api.onDogGrabbed();
          this.state = 'return';
        } else {
          to.normalize();
          p.addScaledVector(to, this.speed * dt);
          p.y = Math.max(heightAt(p.x, p.z), -0.6) + 0.05;
          this.group.lookAt(d.pos.x, p.y, d.pos.z);
          this.runAnim(dt);
          if (this.barkCd <= 0) { this.sfx.bark(); this.barkCd = rand(2.5, 5); }
        }
      }
    } else if (this.state === 'return') {
      const to = this.anchor.clone().sub(p); to.y = 0;
      const dist = to.length();
      if (dist < 0.7) {
        p.copy(this.anchor);
        this.state = 'sit';
        if (this.autoStore) {
          api.storeFromDog(this.carried);
          this.carried = 0;
          this.clearHeldVisuals();
          api.toast('🐕 Tu perro guardó los patos en la caja');
        }
        // modo manual: se sienta con los patos en el hocico, el jugador se acerca
      } else {
        to.normalize();
        p.addScaledVector(to, this.speed * dt);
        p.y = Math.max(heightAt(p.x, p.z), -0.6) + 0.05;
        this.group.lookAt(this.anchor.x, p.y, this.anchor.z);
        this.runAnim(dt);
      }
    } else {
      // sentado
      this.body.rotation.x = Math.sin(this.t * 1.2) * 0.02;
      if (this.carried === 0 && Math.random() < dt * 0.08) {
        this.group.lookAt(api.playerPos().x, p.y, api.playerPos().z);
      }
    }
  }
  runAnim(dt) {
    this.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(this.t * 14 + i * Math.PI) * 0.7;
    });
  }
  sitAnim() { this.legs.forEach(l => l.rotation.x = 0); }
}
