// Fart Together v2 - servidor multiplayer (Node.js + ws)
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
const W = 4000, H = 4000, VIEW = 900, TICK = 40;
const BASIC = ['🫘', '🥦', '🥚', '🌶️'];
const players = new Map();
let food = [], nid = 1, tick = 0;

const rnd = (n) => Math.random() * n;
const radius = (s) => 14 + Math.sqrt(s) * 1.4;
const count = (e) => { let c = 0; for (const f of food) if (f.e === e) c++; return c; };
function spawnFood() {
  const x = 50 + rnd(W - 100), y = 50 + rnd(H - 100), r = Math.random();
  if (r < 0.03) food.push({ x, y, e: Math.random() < 0.5 ? '🖊️' : '🧃', v: 1 }); // caneta azul / refri verde
  else if (r < 0.12) food.push({ x, y, e: '🌽', v: 3 });                          // cuscuz
  else food.push({ x, y, e: BASIC[(Math.random() * 4) | 0], v: 1 });
}
for (let i = 0; i < 400; i++) spawnFood();

function spawn(p) {
  Object.assign(p, { x: 300 + rnd(W - 600), y: 300 + rnd(H - 600), a: rnd(6.28), score: 10, trail: [], boost: false, alive: true, gold: 0, wide: 0, imm: 0, free: 0 });
}

wss.on('connection', (ws) => {
  const p = { id: nid++, ws, name: 'Anônimo', skin: 0, alive: false };
  players.set(p.id, p);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      p.name = String(m.name || 'Anônimo').slice(0, 14);
      p.skin = [0, 1, 2, 3].includes(m.skin) ? m.skin : 0;
      spawn(p); ws.send(JSON.stringify({ t: 'start', id: p.id }));
    } else if (m.t === 'in' && p.alive) { p.a = +m.a || 0; p.boost = !!m.b; }
  });
  ws.on('close', () => players.delete(p.id));
});

function die(p) {
  p.alive = false;
  for (let i = 0; i < p.trail.length; i += 3) food.push({ x: p.trail[i].x, y: p.trail[i].y, e: '💩', v: 2 });
  food.push({ x: p.x, y: p.y, e: '💩', v: 4 });
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t: 'dead', score: Math.floor(p.score) }));
}

function eat(p, f, now) {
  p.score += f.v * 0.8;
  if (f.e === '🥩') { p.gold = now + 5000; p.score += 2; }  // picanha: fumaça dourada 5s
  else if (f.e === '🌽') p.wide = now + 6000;                // cuscuz: rastro largo
  else if (f.e === '🖊️') p.imm = now + 3000;               // caneta azul: imunidade 3s
  else if (f.e === '🧃') p.free = now + 5000;               // refri verde: boost grátis 5s
}

function step() {
  tick++;
  const now = Date.now();
  const alive = [...players.values()].filter((p) => p.alive);
  for (const p of alive) {
    const boosting = p.boost && (p.score > 12 || p.free > now);
    const sp = boosting ? 7 : 4;
    p.x = Math.max(0, Math.min(W, p.x + Math.cos(p.a) * sp * (TICK / 33)));
    p.y = Math.max(0, Math.min(H, p.y + Math.sin(p.a) * sp * (TICK / 33)));
    const last = p.trail[p.trail.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 10) p.trail.push({ x: p.x, y: p.y });
    const maxLen = 15 + p.score * 1.2;
    while (p.trail.length > maxLen) p.trail.shift();
    if (boosting) {
      if (p.free <= now) p.score -= 0.14;
      if (tick % 3 === 0 && p.trail[0]) food.push({ x: p.trail[0].x, y: p.trail[0].y, e: '💨', v: 1 });
    }
    const r = radius(p.score) + 12;
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      if (Math.abs(f.x - p.x) < r && Math.abs(f.y - p.y) < r && Math.hypot(f.x - p.x, f.y - p.y) < r) { eat(p, f, now); food.splice(i, 1); }
    }
  }
  for (const p of alive) {
    if (!p.alive || p.imm > now) continue; // imune atravessa nuvens
    const pr = radius(p.score) * 0.7;
    for (const o of alive) {
      if (o === p || !o.alive) continue;
      const or = radius(o.score) * 0.9 * (o.wide > now ? 1.4 : 1), lim = pr + or;
      for (let i = 0; i < o.trail.length - 2; i += 2) {
        const t = o.trail[i];
        if (Math.abs(t.x - p.x) < lim && Math.abs(t.y - p.y) < lim && Math.hypot(t.x - p.x, t.y - p.y) < lim) { die(p); break; }
      }
      if (!p.alive) break;
    }
  }
  while (food.length < 400) spawnFood();
  if (food.length > 1500) food = food.filter((f) => f.e === '🥩').concat(food.slice(-1400));
  if (count('🥩') < 3) food.push({ x: 100 + rnd(W - 200), y: 100 + rnd(H - 200), e: '🥩', v: 10 }); // picanha rara
  const pk = food.filter((f) => f.e === '🥩').map((f) => [Math.round(f.x), Math.round(f.y)]);
  const top = alive.filter((p) => p.alive).sort((a, b) => b.score - a.score).slice(0, 5).map((p) => [p.name, Math.floor(p.score)]);

  for (const p of players.values()) {
    if (!p.alive || p.ws.readyState !== 1) continue;
    const vis = [];
    for (const o of players.values()) {
      if (!o.alive) continue;
      const tr = [];
      for (const t of o.trail) if (Math.abs(t.x - p.x) < VIEW && Math.abs(t.y - p.y) < VIEW) tr.push(Math.round(t.x), Math.round(t.y));
      if (tr.length || o === p) vis.push({ id: o.id, n: o.name, x: Math.round(o.x), y: Math.round(o.y), a: +o.a.toFixed(2), s: Math.floor(o.score), k: o.skin, b: o.boost, g: o.gold > now ? 1 : 0, w: o.wide > now ? 1 : 0, i: o.imm > now ? 1 : 0, f: o.free > now ? 1 : 0, tr });
    }
    const f = [];
    for (const it of food) if (Math.abs(it.x - p.x) < VIEW && Math.abs(it.y - p.y) < VIEW) f.push([Math.round(it.x), Math.round(it.y), it.e]);
    p.ws.send(JSON.stringify({ t: 's', p: vis, f, top, pk }));
  }
}
setInterval(step, TICK);
console.log('Fart Together v2 server rodando');
