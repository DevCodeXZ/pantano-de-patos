import * as THREE from 'three';
import { rand, mergeGeoms, M4 } from './world.js';
import { buildDuckMesh } from './duck.js';

function signBoard(text, sub = '') {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#8a5a33'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, 494, 238);
  ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText(text, 256, sub ? 105 : 128);
  if (sub) { ctx.font = '36px sans-serif'; ctx.fillStyle = '#c8f7c5'; ctx.fillText(sub, 256, 185); }
  const tex = new THREE.CanvasTexture(cv);
  return new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}

function stall(color, label) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(mergeGeoms([
    [new THREE.BoxGeometry(3.4, 1.0, 1.4), M4(0, 0.5, 0, 0, 0, 0, 1), 0x8a5a33],
    [new THREE.BoxGeometry(3.6, 0.14, 1.6), M4(0, 1.05, 0, 0, 0, 0, 1), color],
    [new THREE.BoxGeometry(0.16, 2.6, 0.16), M4(-1.6, 1.3, -0.6, 0, 0, 0, 1), 0x6e4a2f],
    [new THREE.BoxGeometry(0.16, 2.6, 0.16), M4(1.6, 1.3, -0.6, 0, 0, 0, 1), 0x6e4a2f],
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(base);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.14, 2.2), new THREE.MeshLambertMaterial({ color }));
  roof.position.set(0, 2.65, 0.1); roof.rotation.z = 0.06;
  g.add(roof);
  const s = signBoard(label);
  s.position.set(0, 2, 1.05);
  g.add(s);
  return g;
}

export function buildLobby(scene) {
  scene.background = new THREE.Color(0xa8d8ec);
  scene.fog = new THREE.Fog(0xa8d8ec, 30, 95);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a7040, 1.05));
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.15);
  sun.position.set(25, 40, 18);
  scene.add(sun);

  // suelo con camino
  const tg = new THREE.PlaneGeometry(80, 80, 24, 24);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x74a84c), cPath = new THREE.Color(0xb09468);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.sin(x * 0.15) * Math.cos(z * 0.13) * 0.12);
    tmp.copy(cGrass);
    if (Math.abs(x) < 1.6 && z < 9 && z > -13) tmp.copy(cPath);      // camino al NPC
    if (Math.abs(x + 4 - z * 0.42) < 1.3 && x < 0) tmp.lerp(cPath, 0.7); // al armero
    if (Math.abs(x - 4 - z * 0.42) < 1.3 && x > 0) tmp.lerp(cPath, 0.7); // a la perrera
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));

  // flores
  const fGeo = new THREE.SphereGeometry(0.12, 5, 4);
  const flowers = new THREE.InstancedMesh(fGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 90);
  const fCols = [0xff7070, 0xffd700, 0xff9de2, 0xffffff, 0x9dcaff];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 90; i++) {
    const x = rand(-18, 18), z = rand(-16, 14);
    m4.makeTranslation(x, 0.12, z);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, new THREE.Color(fCols[i % fCols.length]));
  }
  scene.add(flowers);

  // fogata
  const fire = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x6e4a2f }));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.12;
    fire.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xff8822 }));
  flame.position.y = 0.85;
  fire.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
  flame2.position.y = 1.0;
  fire.add(flame2);
  const fireLight = new THREE.PointLight(0xff9040, 1.4, 12);
  fireLight.position.y = 1.2;
  fire.add(fireLight);
  fire.position.set(3.5, 0, -1.5);
  scene.add(fire);

  // faroles
  for (const [lx, lz] of [[-4, -3.5], [4, -3.5], [-3, 6], [3, 6]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
    pole.position.set(lx, 1.3, lz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    bulb.position.set(lx, 2.7, lz);
    scene.add(pole, bulb);
  }

  // armería y perrería
  const armStall = stall(0x3a6b8a, 'ARMERÍA');
  armStall.position.set(-8, 0, -6);
  armStall.rotation.y = 0.5;
  scene.add(armStall);
  const dogStall = stall(0xa5762d, 'PERRERÍA');
  dogStall.position.set(8, 0, -6);
  dogStall.rotation.y = -0.5;
  scene.add(dogStall);

  // casita de perro decorativa
  const ken = new THREE.Mesh(mergeGeoms([
    [new THREE.BoxGeometry(1.3, 1, 1.4), M4(0, 0.5, 0, 0, 0, 0, 1), 0xc09468],
    [new THREE.ConeGeometry(1.15, 0.8, 4), M4(0, 1.35, 0, 0, Math.PI / 4, 0, 1), 0x8a4a2a],
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  ken.position.set(10.2, 0, -4.6);
  scene.add(ken);

  // estanque con patos decorativos
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), new THREE.MeshLambertMaterial({ color: 0x2e6f66, transparent: true, opacity: 0.85 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(8, 0.03, 5.5);
  scene.add(pond);
  const decoDucks = [];
  for (let i = 0; i < 2; i++) {
    const m = buildDuckMesh({ body: 0x9a6b3f, head: 0x2a8f3c, beak: 0xe8a13a, wing: 0xb0875a });
    m.group.scale.setScalar(0.9);
    m.group.position.set(7 + i * 1.4, 0.25, 5 + i * 0.8);
    m.group.rotation.y = rand(0, 6);
    m.home = m.group.position.clone();
    m.scare = { state: 'idle', t: 0, dur: 0, phase: rand(0, 6) };
    scene.add(m.group);
    decoDucks.push(m);
  }

  // patos volando en círculo (ambiente)
  const skyDucks = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = buildDuckMesh({ body: 0x8a6b4f, head: 0x2a6f3c, beak: 0xe8a13a, wing: 0xa0875a });
    m.group.scale.setScalar(0.85);
    m.group.position.set(Math.cos(i * 2.1) * 16, 9 + Math.sin(i * 1.3) * 1.5, Math.sin(i * 2.1) * 16);
    m.group.lookAt(0, 9, 0);
    skyDucks.add(m.group);
  }
  scene.add(skyDucks);

  // NPC cazador + bote
  const npc = new THREE.Group();
  const body = new THREE.Mesh(mergeGeoms([
    [new THREE.CylinderGeometry(0.34, 0.44, 1.05, 7), M4(0, 0.85, 0, 0, 0, 0, 1), 0x4d6b3a],
    [new THREE.SphereGeometry(0.26, 7, 6), M4(0, 1.62, 0, 0, 0, 0, 1), 0xd8a877],
    [new THREE.CylinderGeometry(0.12, 0.3, 0.34, 5), M4(0, 1.86, 0, 0, 0, 0, 1), 0x6e4a2f],  // sombrero copa
    [new THREE.CylinderGeometry(0.34, 0.34, 0.05, 7), M4(0, 1.72, 0, 0, 0, 0, 1), 0x6e4a2f],  // ala
    [new THREE.BoxGeometry(0.5, 0.12, 0.24), M4(0, 1.1, 0.22, 0, 0, 0, 1), 0x8a5a33],          // escopeta al hombro
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  npc.add(body);
  npc.position.set(0, 0, -12);
  scene.add(npc);
  const boat = new THREE.Mesh(mergeGeoms([
    [new THREE.BoxGeometry(1.6, 0.5, 3.4), M4(0, 0.25, 0, 0, 0, 0, 1), 0x8a5a33],
    [new THREE.BoxGeometry(1.2, 0.4, 3.0), M4(0, 0.5, 0, 0, 0, 0, 1), 0x5a3a22],
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  boat.position.set(0.5, 0.1, -15.5);
  boat.rotation.y = 0.4;
  scene.add(boat);

  // cartel grande de fondo
  const bigSign = signBoard('PANTANO DE PATOS', '⚔️ 100 días');
  bigSign.scale.setScalar(2.4);
  bigSign.position.set(0, 3.4, -19);
  scene.add(bigSign);
  for (const px of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.2, 5), new THREE.MeshLambertMaterial({ color: 0x6e4a2f }));
    post.position.set(px, 1.6, -19.2);
    scene.add(post);
  }

  // vallas decorativas
  const fenceM = new THREE.MeshLambertMaterial({ color: 0x9a7343 });
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) < 1) continue;
    for (const [fx, fz, ry] of [[i * 2.2, 12, 0], [i * 2.2, -17.5, 0], [-15.5, i * 2.4 - 2, Math.PI / 2], [15.5, i * 2.4 - 2, Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), fenceM);
      p.position.set(fx, 0.55, fz);
      scene.add(p);
    }
  }

  let t = 0;
  let skySpd = 0.14;   // velocidad de los patos del cielo (se acelera al asustarse)
  const POND = { x: 8, z: 5.5 };
  return {
    interactables: [
      { id: 'armas', pos: new THREE.Vector3(-8, 0, -6), r: 4.2 },
      { id: 'perros', pos: new THREE.Vector3(8, 0, -6), r: 4.2 },
      { id: 'npc', pos: new THREE.Vector3(0, 0, -12), r: 4.5 },
    ],
    // asusta a los patos del estanque: salen volando y luego vuelven
    scare() {
      let n = 0;
      for (const m of decoDucks) {
        if (m.scare.state === 'idle') {
          m.scare.state = 'fly';
          m.scare.t = 0;
          m.scare.dur = rand(7, 11);
          n++;
        }
      }
      skySpd = 0.6;   // los del cielo también se aceleran un ratito
      return n;
    },
    update(dt) {
      t += dt;
      flame.scale.setScalar(1 + Math.sin(t * 9) * 0.14 + Math.sin(t * 23) * 0.07);
      flame2.scale.setScalar(1 + Math.sin(t * 11 + 1) * 0.2);
      fireLight.intensity = 1.2 + Math.sin(t * 13) * 0.3;
      skySpd += (0.14 - skySpd) * Math.min(1, dt * 0.5);
      skyDucks.rotation.y += dt * skySpd;
      decoDucks.forEach((m, i) => {
        const s = m.scare;
        if (s.state === 'idle') {
          m.group.position.y = 0.25 + Math.sin(t * 1.8 + i * 2) * 0.05;
          m.group.rotation.y += Math.sin(t * 0.4 + i) * dt * 0.3;
          m.wingL.rotation.z = 0.3;
          m.wingR.rotation.z = -0.3;
        } else {
          s.t += dt;
          const k = s.t;
          const rad = 2.2 + Math.min(2.6, k * 0.9);            // se aleja al despegar
          const ang = s.phase + k * 1.7;                        // círculo sobre el estanque
          const lift = Math.min(3.4, k * 1.5);                  // gana altura
          const landT = Math.max(0, s.dur - 2.2);               // al final, baja a posarse
          const y = k > landT ? Math.max(0.25, lift - (k - landT) * 1.7) : lift;
          m.group.position.set(POND.x + Math.cos(ang) * rad, y, POND.z + Math.sin(ang) * rad * 0.8);
          m.group.rotation.y = Math.atan2(-Math.sin(ang), Math.cos(ang) * 0.8);
          const flap = Math.sin(t * 26 + i * 3);
          m.wingL.rotation.z = 0.3 + flap * 0.75;
          m.wingR.rotation.z = -0.3 - flap * 0.75;
          if (k >= s.dur) { s.state = 'idle'; m.group.position.copy(m.home); }
        }
      });
      npc.rotation.y = Math.sin(t * 0.5) * 0.3;
    }
  };
}
