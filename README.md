# 🦆 Pantano de Patos

Shooter-tycoon 3D low-poly para celular y PC, hecho con **Three.js** (HTML5, sin instalar nada).
Caza patos en un pantano eternamente diurno, mejora tu rifle y tu perro cobrador, sobrevive a los
patos enfadados y derrota a un jefe gigante cada día durante **100 días**.

## 🎮 Cómo se juega

- **Caza**: patos vuelan en línea recta cruzando el mapa. Mátalos, caen al suelo y los recoges
  (o tu perro los trae por ti).
- **Plumas**: matar un pato suelta plumas (dinero). Cada pato guardado se vende por **10 plumas**.
- **La caja** (al lado de donde apareces): mejora **daño**, **velocidad de recarga** y **capacidad
  de balas** del rifle; **capacidad**, **velocidad** y **guardado automático** del perro; guarda y
  vende tus patos.
- **Perro**: busca automáticamente los patos caídos y los trae a la caja. Mejóralo para que traiga
  más, corra más rápido o los guarde solo.
- **Patos enfadados**: a veces un grupo vuela hacia ti graznando furioso — mátalos antes de que
  te alcancen, o esquiva.
- **Jefes**: cada 15 minutos aparece un pato gigante con habilidades únicas (rayos láser, bolas de
  fuego, meteoritos, ondas expansivas, clones...). Su vida y recompensa crecen con el día.
  Al derrotarlo avanzas al **día siguiente** (100 días, 10 jefes distintos).
- **El progreso se guarda solo** en tu navegador. También puedes iniciar una partida nueva.

## 📱 Controles

| Acción | Móvil | PC |
|---|---|---|
| Moverse | Joystick izquierdo | WASD |
| Mirar | Deslizar lado derecho | Ratón (clic para capturar) |
| Disparar | Botón 🔫 | Clic izquierdo |
| Recargar | Botón 🔄 | R |
| Abrir caja | Botón 📦 (cerca de ella) | E |

## ▶️ Jugar

Abre la página publicada (GitHub Pages) desde el navegador de tu celular, o sirve la carpeta
localmente:

```bash
npx http-server -p 8080   # o: python -m http.server 8080
# abre http://localhost:8080
```

## 🗂️ Estructura

```
index.html         UI, HUD y menús
src/main.js        bucle, economía, guardado, disparo
src/world.js       terreno, agua, juncos, árboles, nubes
src/duck.js        patos, oleadas, plumas
src/dog.js         perro cobrador
src/player.js      controles, rifle, vida
src/chest.js       caja: mejoras y venta
src/bosses.js      los 10 jefes y sus habilidades
src/audio.js       sonidos sintetizados (WebAudio)
vendor/            three.js (r164)
```
