// The heart of the project: generic idempotent executor (exactly-once(ish) effects).
const crypto = require('crypto');
const { db } = require('./db');
const { L } = require('./helpers');
// Diagnostics switch: when drop > 0 the server commits, then kills the connection before replying.
const sim = { drop: 0 };

// ===== Generic idempotent executor: exactly-once(ish) effect for any state-changing request =====
// The whole thing runs in ONE transaction: key lookup, business checks, writes (incl. notification) and key save commit together or not at all.
function once(q, r, action, payload, fn) {
  const raw = q.get('Idempotency-Key'); if (!raw) return r.status(400).json({ message: 'Idempotency-Key header required' });
  const k = q.user.id + ':' + raw, h = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const o = db.transaction(() => {
    const p = db.prepare('SELECT * FROM idem WHERE k=?').get(k);
    if (p) {
      if (p.hash !== h) return { s: 422, b: { message: 'This key was already used for a different request.' } };
      db.prepare('UPDATE idem SET hits=hits+1 WHERE k=?').run(k);
      return { s: 200, replay: 1, b: { ...JSON.parse(p.response), replayed: true } };
    }
    const x = fn(); // only successes are remembered, so a failed "course full" can still succeed on a later attempt
    if (x.s < 300) db.prepare('INSERT INTO idem(k,hash,status,response) VALUES(?,?,?,?)').run(k, h, x.s, JSON.stringify(x.b));
    return x;
  })();
  const lost = sim.drop > 0 && o.s < 300 && !o.replay;
  L(q.user.username, action, raw, lost ? 'SAVED — response lost' : o.replay ? 'REPLAYED stored response' : o.s < 300 ? 'PROCESSED' : 'REJECTED ' + o.s);
  if (lost) { sim.drop--; return q.socket.destroy(); } // diagnostics demo: work committed, connection dies before reply
  r.status(o.s).json(o.b);
}


module.exports = { sim, once };
