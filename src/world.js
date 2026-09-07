import * as THREE from 'three';

export const WATER_Y = -0.85;
export const MAP_R = 118; // radio jugable

// estanques: [x, z, radio]
const PONDS = [
  [34, 26, 19], [-42, -30, 23], [-16, 52, 15], [48, -44, 17], [-62, 34, 16], [10, -70, 20],
];
function pondDip(x, z) {
  let d = 0;
  for (const [px, pz, pr] of PONDS) {
    const dist = Math.hypot(x - px, z - pz);
    if (dist < pr) {
      const t = 1 - dist / pr; // 0 borde .. 1 centro
      d = Math.max(d, t * t * 3.2);
    }
  }
  return d;
}
export function heightAt(x, z) {
  let h = 0;
  h += Math.sin(x * 0.021) * Math.cos(z * 0.018) * 2.2;
  h += Math.sin(x * 0.043 + 1.7) * Math.sin(z * 0.039 + 0.6) * 1.1;
  h += Math.sin(x * 0.11 + 4.2) * Math.cos(z * 0.09 + 2.1) * 0.35;
  h += 1.6;
  // centro despejado y seco (zona de aparición)
  const dc = Math.hypot(x, z);
  if (dc < 26) h += (1 - dc / 26) * 1.1;
  h -= pondDip(x, z);
  return h;
}
export function isWater(x, z) { return heightAt(x, z) < WATER_Y + 0.15; }

// utilidades compartidas -------------------------------------------------
export function rand(a, b) { return a + Math.random() * (b - a); }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function setInst(mesh, i, x, y, z, ry, sx, sy, sz) {
  _p.set(x, y, z); _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}
// fusiona geometrías con color por vértice (para modelos low-poly de 1 draw call)
export function mergeGeoms(parts) {
  let total = 0;
  const prep = parts.map(([geo, mat4, color]) => {
    const g = geo.toNonIndexed();
    g.applyMatrix4(mat4);
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    total += pos.count;
    return { pos, nrm, col };
  });
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const p of prep) {
    P.set(p.pos.array, o * 3); N.set(p.nrm.array, o * 3); C.set(p.col, o * 3);
    o += p.pos.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}
export const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, s, s)
  );

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x9fd0e6);
  scene.fog = new THREE.Fog(0x9fd0e6, 55, 210);

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x55683c, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.25);
  sun.position.set(60, 90, 35);
  scene.add(sun);

  // ---- terreno
  const seg = 88;
  const tg = new THREE.PlaneGeometry(270, 270, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x6f9b45), cMarsh = new THREE.Color(0x79934a),
        cMud = new THREE.Color(0x8a6f47), cDeep = new THREE.Color(0x5d7a3a);
  const tmpC = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = (Math.sin(x * 0.7) * Math.cos(z * 0.6) + 1) / 2;
    tmpC.copy(cGrass).lerp(cMarsh, n);
    if (h < 0.9) tmpC.lerp(cMud, clamp((0.9 - h) / 1.6, 0, 1));
    if (h < WATER_Y + 0.2) tmpC.lerp(cDeep, 0.5);
    cols[i * 3] = tmpC.r; cols[i * 3 + 1] = tmpC.g; cols[i * 3 + 2] = tmpC.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(terrain);

  // ---- agua
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(270, 270),
    new THREE.MeshLambertMaterial({ color: 0x2e6f66, transparent: true, opacity: 0.82 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  // ---- juncos
  const reedGeo = new THREE.ConeGeometry(0.09, 2.6, 4);
  reedGeo.translate(0, 1.3, 0);
  const reeds = new THREE.InstancedMesh(reedGeo, new THREE.MeshLambertMaterial({ color: 0x5c7a35 }), 950);
  let ri = 0;
  while (ri < 950) {
    const x = rand(-MAP_R, MAP_R), z = rand(-MAP_R, MAP_R);
    const h = heightAt(x, z);
    if (h > WATER_Y + 0.5 || h < WATER_Y - 1.4) continue;
    setInst(reeds, ri++, x, h - 0.1, z, rand(0, 6.28), rand(0.7, 1.5), rand(0.7, 1.6), rand(0.7, 1.5));
  }
  scene.add(reeds);

  // ---- nenúfares
  const padGeo = new THREE.CircleGeometry(0.85, 7);
  padGeo.rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padGeo, new THREE.MeshLambertMaterial({ color: 0x3f8f3f }), 90);
  for (let i = 0; i < 90; i++) {
    const pd = PONDS[i % PONDS.length];
    const a = rand(0, 6.28), r = rand(2, pd[2] * 0.75);
    setInst(pads, i, pd[0] + Math.cos(a) * r, WATER_Y + 0.04, pd[1] + Math.sin(a) * r, rand(0, 6.28), rand(0.6, 1.3), 1, rand(0.6, 1.3));
  }
  scene.add(pads);

  // ---- árboles (cipreses low-poly)
  const spots = [];
  let tries = 0;
  while (spots.length < 46 && tries++ < 600) {
    const x = rand(-MAP_R + 6, MAP_R - 6), z = rand(-MAP_R + 6, MAP_R - 6);
    if (Math.hypot(x, z) < 22) continue;           // despejado en el spawn
    if (heightAt(x, z) < 1.2) continue;            // fuera del agua
    if (spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 14)) continue;
    spots.push([x, z]);
  }
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.5, 2.4, 5).translate(0, 1.2, 0),
    new THREE.MeshLambertMaterial({ color: 0x6e4a2f }), spots.length);
  const canL = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.1, 3.6, 6).translate(0, 3.4, 0),
    new THREE.MeshLambertMaterial({ color: 0x3a6b30 }), spots.length);
  const canU = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.4, 3.0, 6).translate(0, 5.4, 0),
    new THREE.MeshLambertMaterial({ color: 0x4a7d38 }), spots.length);
  spots.forEach(([x, z], i) => {
    const y = heightAt(x, z), s = rand(0.8, 1.7);
    setInst(trunk, i, x, y - 0.2, z, rand(0, 6.28), s, s, s);
    setInst(canL, i, x, y - 0.2, z, rand(0, 6.28), s, s, s);
    setInst(canU, i, x, y - 0.2, z, rand(0, 6.28), s, s, s);
  });
  scene.add(trunk, canL, canU);

  // ---- rocas
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.8, 0),
    new THREE.MeshLambertMaterial({ color: 0x8d8d86, flatShading: true }), 34);
  for (let i = 0; i < 34; i++) {
    const x = rand(-MAP_R, MAP_R), z = rand(-MAP_R, MAP_R), h = heightAt(x, z);
    if (h < WATER_Y) { setInst(rocks, i, x, -5, z, 0, 0.001, 0.001, 0.001); continue; }
    setInst(rocks, i, x, h + 0.1, z, rand(0, 6.28), rand(0.5, 1.6), rand(0.4, 1.1), rand(0.5, 1.6));
  }
  scene.add(rocks);

  // ---- nubes
  const clouds = [];
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, emissiveIntensity: 0.25 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rand(3, 5.5), 7, 5), cm);
      m.position.set(j * rand(3, 5) - 4, rand(-0.6, 0.8), rand(-2, 2));
      m.scale.y = 0.45;
      g.add(m);
    }
    g.position.set(rand(-140, 140), rand(42, 62), rand(-140, 140));
    scene.add(g);
    clouds.push(g);
  }

  return {
    terrain,
    update(dt) {
      for (const cl of clouds) {
        cl.position.x += dt * 1.1;
        if (cl.position.x > 160) cl.position.x = -160;
      }
    }
  };
}
