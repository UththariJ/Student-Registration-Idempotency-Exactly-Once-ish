// Small shared helpers: request log, course ownership check, notifications.
const { db } = require('./db');
const L = (who, action, k, outcome) => db.prepare('INSERT INTO log(who,action,k,outcome) VALUES(?,?,?,?)').run(who, action, k, outcome);
const own = (u, code) => db.prepare('SELECT 1 FROM courses WHERE code=? AND lecturer_id=?').get(code, u.id);
const notify = (uid, m) => db.prepare('INSERT INTO notifications(user_id,message) VALUES(?,?)').run(uid, m);

module.exports = { L, own, notify };
