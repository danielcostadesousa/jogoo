// Fart Together - servidor multiplayer (Node.js + ws)
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
const W = 4000, H = 4000, VIEW = 1000, TICK = 33;
const FOODS = ['🫘', '🥦', '🥚', '🌶️'];
const COLORS = ['#f4a261', '#e76f51', '#2a9d8f', '#e9c46a', '#a78bfa', '#f472b6', '#60a5fa'];
const players = new Map();
let food = [], nid = 1, tick = 0;

const rnd = (n) => Math.random() * n;
const radius = (s) => 14 + Math.sqrt(s) * 1.4;
function spawnFood() {
  food.push({ x: 50 + rnd(W - 100), y: 50 + rnd(H - 100), e: FOODS[(Math.random() * 4) | 0], v: 1 });
}
for (let i = 0; i < 400; i++) spawnFood();

function spawn(p) {
  Object.assign(p, { x: 300 + rnd(W - 600), y: 300 + rnd(H - 600), a: rnd(6.28), score: 10, trail: [], boost: false, alive: true });
}

wss.on('connection', (ws) => {
  const p = { id: nid++, ws, name: 'Anônimo', color: COLORS[(Math.random() * COLORS.length) | 0], alive: false };
  players.set(p.id, p);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') { p.name = String(m.name || 'Anônimo').slice(0, 14); spawn(p); ws.send(JSON.stringify({ t: 'start', id: p.id })); }
    else if (m.t === 'in' && p.alive) { p.a = +m.a || 0; p.boost = !!m.b; }
  });
  ws.on('close', () => players.delete(p.id));
});

function die(p) {
  p.alive = false;
  const pts = p.trail;
  for (let i = 0; i < pts.length; i += 3) food.push({ x: pts[i].x, y: pts[i].y, e: '💩', v: 2 });
  food.push({ x: p.x, y: p.y, e: '💩', v: 4 });
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t: 'dead', score: Math.floor(p.score) }));
}

function step() {
  tick++;
  const alive = [...players.values()].filter((p) => p.alive);
  for (const p of alive) {
    const boosting = p.boost && p.score > 12;
    const sp = boosting ? 7 : 4;
    p.x = Math.max(0, Math.min(W, p.x + Math.cos(p.a) * sp));
    p.y = Math.max(0, Math.min(H, p.y + Math.sin(p.a) * sp));
    const last = p.trail[p.trail.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 10) p.trail.push({ x: p.x, y: p.y });
    const maxLen = 15 + p.score * 1.2;
    while (p.trail.length > maxLen) p.trail.shift();
    if (boosting) {
      p.score -= 0.12;
      if (tick % 4 === 0 && p.trail[0]) food.push({ x: p.trail[0].x, y: p.trail[0].y, e: '💨', v: 1 });
    }
    // comer
    const r = radius(p.score) + 12;
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      if (Math.abs(f.x - p.x) < r && Math.abs(f.y - p.y) < r && Math.hypot(f.x - p.x, f.y - p.y) < r) { p.score += f.v * 0.8; food.splice(i, 1); }
    }
  }
  // colisão: cabeça toca rastro alheio
  for (const p of alive) {
    if (!p.alive) continue;
    const pr = radius(p.score) * 0.7;
    for (const o of alive) {
      if (o === p || !o.alive) continue;
      const or = radius(o.score) * 0.9;
      for (let i = 0; i < o.trail.length - 2; i += 2) {
        const t = o.trail[i];
        if (Math.abs(t.x - p.x) < pr + or && Math.abs(t.y - p.y) < pr + or && Math.hypot(t.x - p.x, t.y - p.y) < pr + or) { die(p); break; }
      }
      if (!p.alive) break;
    }
  }
  while (food.length < 400) spawnFood();
  if (food.length > 1500) food.splice(0, food.length - 1500);

  const top = alive.sort((a, b) => b.score - a.score).slice(0, 5).map((p) => [p.name, Math.floor(p.score)]);
  for (const p of players.values()) {
    if (!p.alive || p.ws.readyState !== 1) continue;
    const vis = [];
    for (const o of players.values()) {
      if (!o.alive) continue;
      const tr = [];
      for (const t of o.trail) if (Math.abs(t.x - p.x) < VIEW && Math.abs(t.y - p.y) < VIEW) tr.push(Math.round(t.x), Math.round(t.y));
      if (tr.length || o === p) vis.push({ id: o.id, n: o.name, x: Math.round(o.x), y: Math.round(o.y), a: +o.a.toFixed(2), s: Math.floor(o.score), c: o.color, b: o.boost, tr });
    }
    const f = [];
    for (const it of food) if (Math.abs(it.x - p.x) < VIEW && Math.abs(it.y - p.y) < VIEW) f.push([Math.round(it.x), Math.round(it.y), it.e]);
    p.ws.send(JSON.stringify({ t: 's', p: vis, f, top }));
  }
}
setInterval(step, TICK);
console.log('Fart Together server rodando');
