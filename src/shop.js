// Armas y perros del lobby con rarezas
export const RARITY = {
  comun:      { label: 'Común',      color: '#9aa5a0', glow: '#c8d2cc' },
  raro:       { label: 'Raro',       color: '#4dd88a', glow: '#7af0ae' },
  epico:      { label: 'Épico',      color: '#b06ef5', glow: '#d0a0ff' },
  legendario: { label: 'Legendario', color: '#ff9d2e', glow: '#ffc477' },
  mitico:     { label: 'Mítico',     color: '#ff4d6a', glow: '#ff9db0' },
};

// dmg en "patos de vida" (un pato normal = 1), interval = seg entre disparos
export const WEAPONS = [
  { id: 'rustico',  name: 'Rifle Rústico',       rarity: 'comun',      price: 0,    dmg: 1.5, interval: 0.30, mag: 5,  reload: 2.2, color: 0x8a6f47, desc: 'El viejo y fiel del abuelo.' },
  { id: 'juncal',   name: 'Escopeta de Juncos',  rarity: 'raro',       price: 350,  dmg: 1.2, interval: 0.48, mag: 4,  reload: 2.4, pellets: 3, color: 0x4a7d38, desc: '3 postas por disparo: golpea varios patos a la vez.' },
  { id: 'certero',  name: 'Rifle Certero',       rarity: 'epico',      price: 800,  dmg: 3.0, interval: 0.20, mag: 8,  reload: 1.8, color: 0x3a6b8a, desc: 'Rápido, potente y preciso.' },
  { id: 'ballesta', name: 'Ballesta Penetrante', rarity: 'legendario', price: 1600, dmg: 4.0, interval: 0.34, mag: 6,  reload: 1.9, pierce: 2, color: 0x8a3a8a, desc: 'Atraviesa hasta 2 patos alineados.' },
  { id: 'tormenta', name: 'Fusil Tormenta',      rarity: 'mitico',     price: 3000, dmg: 3.5, interval: 0.13, mag: 14, reload: 1.6, color: 0xd8a825, desc: 'Cadencia demencial: lluvia de plomo.' },
  { id: 'rey',      name: 'Cañón del Rey Pato',  rarity: 'mitico',     price: 5000, dmg: 7.0, interval: 0.26, mag: 10, reload: 1.5, splash: 2.4, color: 0x50c0e0, desc: 'Explosión de plumas: daño en área.' },
];

// perros: cada uno con aspecto y bono distintos
export const DOGS = [
  { id: 'firulais', name: 'Firulais', rarity: 'comun',      price: 0,    cap: 1, spd: 6.5,  auto: false, perk: 'El clásico fiel, sin bonos.',        colors: { fur: 0xb58a4f, dark: 0x8a6236, collar: 0xd23b2f } },
  { id: 'rocket',   name: 'Rocket',   rarity: 'raro',       price: 400,  cap: 1, spd: 9.5,  auto: false, perk: '+45% de velocidad de búsqueda.',      colors: { fur: 0x3a3a3a, dark: 0x232323, collar: 0x35c0e0 } },
  { id: 'max',      name: 'Max',      rarity: 'raro',       price: 450,  cap: 3, spd: 6.5,  auto: false, perk: 'Lleva 3 patos por viaje.',           colors: { fur: 0xd8c8a8, dark: 0xb0a080, collar: 0x4d8f3c } },
  { id: 'luna',     name: 'Luna',     rarity: 'epico',      price: 900,  cap: 2, spd: 7.5,  auto: true,  perk: 'Guarda sola los patos en la caja.',  colors: { fur: 0xe8e8f0, dark: 0xc0c0d0, collar: 0x8a3a8a } },
  { id: 'thor',     name: 'Thor',     rarity: 'epico',      price: 1100, cap: 2, spd: 9.8,  auto: true,  perk: 'Rápido, 2 huecos y guarda solo.',    colors: { fur: 0x6e4a2f, dark: 0x503420, collar: 0xffd700 } },
  { id: 'chispa',   name: 'Chispa',   rarity: 'legendario', price: 2000, cap: 4, spd: 11.5, auto: true,  perk: '4 huecos, velocísimo y guarda solo.', colors: { fur: 0xff7043, dark: 0xd85a2b, collar: 0x35e0e0 } },
];

export const weaponById = id => WEAPONS.find(w => w.id === id) || WEAPONS[0];
export const dogById = id => DOGS.find(d => d.id === id) || DOGS[0];
