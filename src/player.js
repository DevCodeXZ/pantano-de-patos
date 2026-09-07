import * as THREE from 'three';
import { heightAt, WATER_Y, MAP_R, clamp, mergeGeoms, M4 } from './world.js';

export const SWAMP_SPAWN = { x: -14, z: 24 };   // campamento junto a la caja
export const LOBBY_SPAWN = { x: 0, z: 8 };

export class Player {
  constructor(camera, dom, sfx, api) {
    this.cam = camera;
    this.sfx = sfx;
    this.api = api;
    this.pos = new THREE.Vector3(LOBBY_SPAWN.x, 1.7, LOBBY_SPAWN.z);
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.hurtCd = 0;
    this.regenCd = 0;
    this.dead = false;
    this.slowT = 0;
    this.wantSprint = false;

    // arma equipada
    this.dmg = 1.5;
    this.magSize = 5;
    this.reloadTime = 2.2;
    this.fireInterval = 0.3;
    this.weapon = null;
    this.ammo = this.magSize;
    this.reloading = false;
    this.reloadT = 0;
    this.fireCd = 0;
    this.recoil = 0;

    this.buildRifle();
    this.setupInput(dom);
  }
  buildRifle() {
    const g = new THREE.Group();
    const geo = mergeGeoms([
      [new THREE.BoxGeometry(0.07, 0.09, 0.9), M4(0, 0, -0.28, 0, 0, 0, 1), 0x4a4a52],
      [new THREE.BoxGeometry(0.09, 0.14, 0.34), M4(0, -0.03, 0.18, 0.12, 0, 0, 1), 0x6e4a2f],
      [new THREE.BoxGeometry(0.06, 0.12, 0.14), M4(0, -0.09, -0.02, 0.3, 0, 0, 1), 0x5a3d26],
      [new THREE.CylinderGeometry(0.045, 0.045, 0.18, 6), M4(0, 0.07, -0.2, Math.PI / 2, 0, 0, 1), 0x303036],
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.rifle = new THREE.Mesh(geo, mat);
    g.add(this.rifle);
    // acento de color según el arma equipada
    this.accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.105, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x8a6f47 })
    );
    this.accent.position.set(0, 0.045, -0.42);
    g.add(this.accent);
    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 })
    );
    this.muzzle.position.set(0, 0, -0.78);
    this.muzzle.visible = false;
    g.add(this.muzzle);
    g.position.set(0.3, -0.26, -0.55);
    this.gunGroup = g;
    this.cam.add(g);
  }
  setWeapon(w) {
    this.weapon = w;
    this.dmg = w.dmg;
    this.magSize = w.mag;
    this.reloadTime = w.reload;
    this.fireInterval = w.interval;
    this.ammo = w.mag;
    this.reloading = false;
    this.accent.material.color.setHex(w.color);
  }

  setupInput(dom) {
    this.keys = {};
    this.joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
    this.look = { id: null, lx: 0, ly: 0 };
    this.wantFire = false;

    addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyE') this.api.interact();
    });
    addEventListener('keyup', e => this.keys[e.code] = false);

    dom.addEventListener('click', () => {
      if (!('ontouchstart' in window) && this.api.isPlaying() && !document.pointerLockElement) {
        dom.requestPointerLock?.();
      }
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.25, 1.25);
      }
    });
    addEventListener('mousedown', e => { if (document.pointerLockElement && e.button === 0) this.wantFire = true; });
    addEventListener('mouseup', e => { if (e.button === 0) this.wantFire = false; });

    // táctil: joystick (zona izq) + mirar (zona der)
    const joyZone = document.getElementById('joyZone');
    const lookZone = document.getElementById('lookZone');
    const joyBase = document.getElementById('joyBase');
    const joyStick = document.getElementById('joyStick');

    const setStick = (dx, dy) => {
      joyStick.style.left = (31 + dx * 34) + 'px';
      joyStick.style.top = (31 + dy * 34) + 'px';
    };
    joyZone.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (this.joy.active) continue;
        this.joy.active = true; this.joy.id = t.identifier;
        this.joy.cx = t.clientX; this.joy.cy = t.clientY;
        this.joy.dx = 0; this.joy.dy = 0;
        joyBase.style.display = 'block';
        joyBase.style.left = (t.clientX - 55) + 'px';
        joyBase.style.top = (t.clientY - 55) + 'px';
        setStick(0, 0);
      }
      e.preventDefault();
    }, { passive: false });
    joyZone.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = (t.clientX - this.joy.cx) / 48, dy = (t.clientY - this.joy.cy) / 48;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        this.joy.dx = dx; this.joy.dy = dy;
        setStick(dx, dy);
      }
      e.preventDefault();
    }, { passive: false });
    const joyEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        this.joy.active = false; this.joy.id = null;
        this.joy.dx = 0; this.joy.dy = 0;
        joyBase.style.display = 'none';
      }
    };
    joyZone.addEventListener('touchend', joyEnd);
    joyZone.addEventListener('touchcancel', joyEnd);

    lookZone.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (this.look.id === null) {
          this.look.id = t.identifier;
          this.look.lx = t.clientX; this.look.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    lookZone.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.look.id) continue;
        this.yaw -= (t.clientX - this.look.lx) * 0.0042;
        this.pitch = clamp(this.pitch - (t.clientY - this.look.ly) * 0.0035, -1.25, 1.25);
        this.look.lx = t.clientX; this.look.ly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const lookEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === this.look.id) this.look.id = null;
    };
    lookZone.addEventListener('touchend', lookEnd);
    lookZone.addEventListener('touchcancel', lookEnd);

    const bind = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); up && up(); }, { passive: false });
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
    };
    bind('btnFire', () => this.wantFire = true, () => this.wantFire = false);
    bind('btnReload', () => this.startReload());
    bind('btnSprint', () => this.wantSprint = true, () => this.wantSprint = false);
  }

  startReload() {
    if (this.reloading || this.ammo >= this.magSize || this.dead) return;
    this.reloading = true;
    this.reloadT = this.reloadTime;
    this.sfx.reloadClick();
  }
  fire() {
    if (this.dead || this.reloading || this.fireCd > 0) return;
    if (this.ammo <= 0) { this.sfx.empty(); this.startReload(); return; }
    this.ammo--;
    this.fireCd = this.fireInterval;
    this.recoil = 1;
    this.muzzle.visible = true;
    this.muzzleT = 0.05;
    this.sfx.shot();
    this.api.onShot();
  }
  takeDamage(n) {
    if (this.dead || this.hurtCd > 0) return;
    this.hp -= n;
    this.hurtCd = 0.35;
    this.regenCd = 5;
    this.api.onHurt();
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.api.onPlayerDead(); }
  }
  slow(t) { this.slowT = Math.max(this.slowT, t); }
  toLobby() {
    this.hp = this.maxHp;
    this.dead = false;
    this.pos.set(LOBBY_SPAWN.x, 1.7, LOBBY_SPAWN.z);
    this.yaw = 0; this.pitch = 0;
    this.wantFire = false;
  }
  respawn() { // en el pantano, mirando la caja
    this.hp = this.maxHp;
    this.dead = false;
    this.pos.set(SWAMP_SPAWN.x, 3, SWAMP_SPAWN.z);
    this.yaw = Math.atan2(-(CHEST_POS.x - SWAMP_SPAWN.x), -(CHEST_POS.z - SWAMP_SPAWN.z));
    this.pitch = 0;
    this.wantFire = false;
  }
  update(dt) {
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloading = false; this.ammo = this.magSize; }
    }
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.wantFire) this.fire();
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzle.visible = false; }
    if (this.hurtCd > 0) this.hurtCd -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.regenCd > 0) this.regenCd -= dt;
    else if (this.hp < this.maxHp && !this.dead) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);

    // movimiento
    let mx = 0, mz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) mz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) mz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;
    mx += this.joy.dx; mz += this.joy.dy;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = mx * cos - mz * sin;
    const wz = mx * sin + mz * cos;
    const inWater = heightAt(this.pos.x, this.pos.z) < WATER_Y + 0.2;
    const sprinting = (this.wantSprint || this.keys['ShiftLeft'] || this.keys['ShiftRight']) && ml > 0.2;
    let sp = 8 * (sprinting ? 1.6 : 1);
    if (this.slowT > 0) sp *= 0.5;
    if (inWater) sp *= 0.55;
    sp *= Math.min(1, ml);
    const inLobby = this.api.mode() === 'lobby';
    const bound = inLobby ? 17 : MAP_R;
    this.pos.x = clamp(this.pos.x + wx * sp * dt, -bound, bound);
    this.pos.z = clamp(this.pos.z + wz * sp * dt, inLobby ? -18 : -MAP_R, inLobby ? 13 : MAP_R);
    const ground = inLobby
      ? 0
      : Math.max(heightAt(this.pos.x, this.pos.z), WATER_Y + 0.25);
    this.pos.y += (ground + 1.65 - this.pos.y) * Math.min(1, 12 * dt);

    // cámara + FOV al correr
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.y = this.yaw;
    this.cam.rotation.x = this.pitch;
    this.cam.position.copy(this.pos);
    if (ml > 0.1) this.bobT = (this.bobT || 0) + dt * sp * 1.4;
    this.cam.position.y += Math.sin(this.bobT || 0) * 0.045;
    const targetFov = sprinting ? 83 : 75;
    if (Math.abs(this.cam.fov - targetFov) > 0.1) {
      this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, 8 * dt);
      this.cam.updateProjectionMatrix();
    }

    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.rifle.position.z = -0.02 + this.recoil * 0.09;
    this.rifle.rotation.x = this.reloading ? -0.8 + Math.sin((1 - this.reloadT / this.reloadTime) * Math.PI) * 0.3 : this.recoil * 0.12;
  }
}
// posición de la caja (campamento apartado de las rutas de vuelo)
export const CHEST_POS = { x: -20, z: 30 };
