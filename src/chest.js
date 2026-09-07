import * as THREE from 'three';
import { heightAt, mergeGeoms, M4 } from './world.js';

// precios moderados: coste = base * mult^nivel
export const UPG = {
  dmg:    { tab: 'arma',  name: 'Daño',              icon: '💥', max: 10, base: 45, mult: 1.55, desc: 'Más daño por bala' },
  reload: { tab: 'arma',  name: 'Velocidad de recarga', icon: '⏱️', max: 8, base: 35, mult: 1.5, desc: 'Recarga más rápido' },
  mag:    { tab: 'arma',  name: 'Capacidad de balas', icon: '🎯', max: 8, base: 40, mult: 1.5, desc: 'Más balas por cargador' },
  dogCap: { tab: 'perro', name: 'Capacidad del perro', icon: '🎒', max: 6, base: 90, mult: 1.7, desc: 'Patos que trae por viaje' },
  dogSpd: { tab: 'perro', name: 'Velocidad del perro', icon: '💨', max: 8, base: 55, mult: 1.5, desc: 'Busca los patos más rápido' },
  dogAuto:{ tab: 'perro', name: 'Guardado automático', icon: '📦', max: 1, base: 600, mult: 1, desc: 'El perro guarda solo en la caja' },
};
export const cost = (id, lvl) => Math.round(UPG[id].base * Math.pow(UPG[id].mult, lvl));
export const STAT = {
  dmg: l => 1 + l * 0.5,
  reload: l => 2.2 - l * 0.18,
  mag: l => 5 + l * 2,
  dogCap: l => 1 + l,
  dogSpd: l => 6.5 + l * 0.9,
};
export const SELL_PER_DUCK = 10;

export function buildChestMesh() {
  const g = new THREE.Group();
  const wood = mergeGeoms([
    [new THREE.BoxGeometry(1.5, 0.9, 1.1), M4(0, 0.45, 0, 0, 0, 0, 1), 0x8a5a33],
    [new THREE.BoxGeometry(1.56, 0.16, 1.16), M4(0, 0.72, 0, 0, 0, 0, 1), 0x5a3a22],   // tapa
    [new THREE.BoxGeometry(0.14, 0.94, 1.16), M4(0.45, 0.45, 0, 0, 0, 0, 1), 0x4a4a4a],// bandas
    [new THREE.BoxGeometry(0.14, 0.94, 1.16), M4(-0.45, 0.45, 0, 0, 0, 0, 1), 0x4a4a4a],
    [new THREE.BoxGeometry(1.7, 0.12, 1.3), M4(0, 0.04, 0, 0, 0, 0, 1), 0x6e4a2f],     // base
  ]);
  const body = new THREE.Mesh(wood, new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(body);
  // letrero
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#6e4a2f'; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CAJA', 128, 66);
  const tex = new THREE.CanvasTexture(cv);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.set(0, 1.75, 0);
  g.add(sign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 5), new THREE.MeshLambertMaterial({ color: 0x6e4a2f }));
  post.position.set(0, 1.0, 0.1);
  g.add(post);
  return g;
}

export class Chest {
  constructor(scene, pos, sfx) {
    this.pos = pos.clone();
    this.sfx = sfx;
    this.mesh = buildChestMesh();
    this.mesh.position.copy(pos);
    this.mesh.rotation.y = Math.PI; // mirando al spawn
    scene.add(this.mesh);
    this.stored = 0;
  }
  static groundY(x, z) { return Math.max(heightAt(x, z), 0) ; }

  // ------- UI -------
  buildUI(ui) {
    this.ui = ui;
    for (const tab of ['arma', 'perro', 'venta']) {
      const page = document.getElementById('page' + tab[0].toUpperCase() + tab.slice(1));
      page.innerHTML = '';
    }
    const pArma = document.getElementById('pageArma');
    pArma.innerHTML = '<h3>🔫 Mejoras del rifle</h3>';
    for (const id of ['dmg', 'reload', 'mag']) pArma.appendChild(this.upRow(id));
    const pPerro = document.getElementById('pagePerro');
    pPerro.innerHTML = '<h3>🐕 Mejoras del perro</h3>';
    for (const id of ['dogCap', 'dogSpd', 'dogAuto']) pPerro.appendChild(this.upRow(id));
    const pVenta = document.getElementById('pageVenta');
    pVenta.innerHTML = `
      <h3>🦆 Guardar y vender</h3>
      <div class="sellLine"><span>🎒 Patos que llevas encima</span><b id="cCarried">0</b></div>
      <button class="bigbtn sec" id="btnStore">📥 Guardar patos en la caja</button>
      <div class="sellLine"><span>📦 Patos guardados</span><b id="cStored">0</b></div>
      <div class="sellLine"><span>💵 Precio por pato</span><b>${SELL_PER_DUCK} plumas</b></div>
      <button class="bigbtn" id="btnSell">💰 Vender todos</button>`;
    document.getElementById('btnStore').onclick = () => ui.storeCarried();
    document.getElementById('btnSell').onclick = () => ui.sellAll();
  }
  upRow(id) {
    const u = UPG[id];
    const row = document.createElement('div');
    row.className = 'upRow';
    row.innerHTML = `
      <div class="upInfo"><b>${u.icon} ${u.name}</b><small>${u.desc}</small>
        <span class="lvlDots" id="dots_${id}"></span></div>
      <button class="upBuy" id="buy_${id}"></button>`;
    row.querySelector(`#buy_${id}`).onclick = () => this.ui.buy(id);
    return row;
  }
  refreshUI(lvls, plumas, carried, stored) {
    document.getElementById('chestWallet').textContent = `🪶 ${plumas} plumas`;
    for (const id in UPG) {
      const u = UPG[id], lvl = lvls[id] || 0;
      const dots = document.getElementById('dots_' + id);
      const btn = document.getElementById('buy_' + id);
      if (!dots || !btn) continue;
      dots.textContent = '●'.repeat(lvl) + '○'.repeat(u.max - lvl) + `  Nv. ${lvl}/${u.max}`;
      if (lvl >= u.max) {
        btn.textContent = 'MÁX';
        btn.classList.add('max');
        btn.disabled = true;
      } else {
        const c = cost(id, lvl);
        btn.textContent = `🪶 ${c}`;
        btn.classList.remove('max');
        btn.disabled = plumas < c;
      }
    }
    document.getElementById('cCarried').textContent = carried;
    document.getElementById('cStored').textContent = stored;
    document.getElementById('btnStore').disabled = carried <= 0;
    document.getElementById('btnSell').disabled = stored <= 0;
  }
}
