import * as THREE from 'three';
import { heightAt, mergeGeoms, M4 } from './world.js';

export const SELL_PER_DUCK = 10;

export function buildChestMesh() {
  const g = new THREE.Group();
  const wood = mergeGeoms([
    [new THREE.BoxGeometry(1.5, 0.9, 1.1), M4(0, 0.45, 0, 0, 0, 0, 1), 0x8a5a33],
    [new THREE.BoxGeometry(1.56, 0.16, 1.16), M4(0, 0.72, 0, 0, 0, 0, 1), 0x5a3a22],
    [new THREE.BoxGeometry(0.14, 0.94, 1.16), M4(0.45, 0.45, 0, 0, 0, 0, 1), 0x4a4a4a],
    [new THREE.BoxGeometry(0.14, 0.94, 1.16), M4(-0.45, 0.45, 0, 0, 0, 0, 1), 0x4a4a4a],
    [new THREE.BoxGeometry(1.7, 0.12, 1.3), M4(0, 0.04, 0, 0, 0, 0, 1), 0x6e4a2f],
  ]);
  const body = new THREE.Mesh(wood, new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(body);
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#6e4a2f'; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CAJA', 128, 66);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.65),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide })
  );
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
    this.mesh.rotation.y = Math.PI * 0.25;
    scene.add(this.mesh);
    this.stored = 0;
  }
  buildUI() {
    const page = document.getElementById('pageVenta');
    page.innerHTML = `
      <h3>🦆 Guardar y vender</h3>
      <div class="sellLine"><span>🎒 Patos que llevas encima</span><b id="cCarried">0</b></div>
      <button class="bigbtn sec" id="btnStore">📥 Guardar patos en la caja</button>
      <div class="sellLine"><span>📦 Patos guardados</span><b id="cStored">0</b></div>
      <div class="sellLine"><span>💵 Precio por pato</span><b>${SELL_PER_DUCK} plumas</b></div>
      <button class="bigbtn" id="btnSell">💰 Vender todos</button>`;
    document.getElementById('btnStore').onclick = () => window.__pantanoUI.storeCarried();
    document.getElementById('btnSell').onclick = () => window.__pantanoUI.sellAll();
  }
  refreshUI(plumas, carried, stored) {
    document.getElementById('chestWallet').textContent = `🪶 ${plumas} plumas`;
    document.getElementById('cCarried').textContent = carried;
    document.getElementById('cStored').textContent = stored;
    document.getElementById('btnStore').disabled = carried <= 0;
    document.getElementById('btnSell').disabled = stored <= 0;
  }
}
