const router = require('express').Router();
const { db, H, seed } = require('../db');
const { A, W } = require('../middleware');
const { sim, once } = require('../idempotency');

// ===== Admin =====
router.get('/api/admin/users', A('admin'), W((q, r) => r.json(db.prepare("SELECT id,username,role,name,email FROM users WHERE role!='admin' ORDER BY role,username").all())));
router.post('/api/admin/users', A('admin'), W((q, r) => {
  once(q, r, 'ADD USER', q.body, () => {
    const username = String(q.body.username || '').trim();
    const password = String(q.body.password || '');
    const role = String(q.body.role || '').trim().toLowerCase();
    const name = String(q.body.name || '').trim();
    const email = String(q.body.email || '').trim().toLowerCase();
    if (!username || !password || !name || !email || !['student', 'lecturer'].includes(role)) return { s: 400, b: { message: 'username, password, name, email and role are required' } };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { s: 400, b: { message: 'Enter a valid email address' } };
    if (role === 'student' && email.split('@')[0] !== username.toLowerCase()) return { s: 400, b: { message: 'Student email must match the username/ID (for example, BIT0018@uni.lk)' } };
    if (db.prepare('SELECT 1 FROM users WHERE lower(trim(username))=lower(trim(?))').get(username)) return { s: 409, b: { message: 'This username already exists' } };
    if (db.prepare('SELECT 1 FROM users WHERE lower(trim(name))=lower(trim(?))').get(name)) return { s: 409, b: { message: 'This name already exists' } };
    if (db.prepare('SELECT 1 FROM users WHERE lower(trim(email))=lower(trim(?))').get(email)) return { s: 409, b: { message: 'This email already exists' } };
    db.prepare('INSERT INTO users(username,pw,role,name,email) VALUES(?,?,?,?,?)').run(username, H(password), role, name, email);
    return { s: 201, b: { message: 'User added' } };
  });
}));
router.delete('/api/admin/users/:id', A('admin'), W((q, r) => once(q, r, 'REMOVE USER', { id: q.params.id }, () => db.transaction(() => {
  db.prepare("SELECT course_code FROM registrations WHERE student_id=? AND status='Registered'").all(q.params.id).forEach(g => db.prepare('UPDATE courses SET available=available+1 WHERE code=?').run(g.course_code));
  db.prepare('DELETE FROM registrations WHERE student_id=?').run(q.params.id); db.prepare('UPDATE courses SET lecturer_id=NULL WHERE lecturer_id=?').run(q.params.id);
  db.prepare("DELETE FROM users WHERE id=? AND role!='admin'").run(q.params.id); return { s: 200, b: { message: 'User removed' } };
})())));
router.post('/api/admin/courses', A('admin'), W((q, r) => {
  const payload = { ...q.body, code: String(q.body.code || '').trim(), name: String(q.body.name || '').trim() };
  once(q, r, 'ADD COURSE', payload, () => {
    const { code, name, credits, capacity, lecturer_id } = payload; if (!code || !name || !(capacity > 0)) return { s: 400, b: { message: 'code, name and capacity>0 required' } };
    if (db.prepare('SELECT 1 FROM courses WHERE lower(trim(name))=lower(trim(?))').get(name)) return { s: 409, b: { message: 'A course with this name already exists. Use a different module name.' } };
    db.prepare('INSERT INTO courses VALUES(?,?,?,?,?,?)').run(code, name, credits || 3, capacity, capacity, lecturer_id || null); return { s: 201, b: { message: 'Course added' } };
  });
}));
router.put('/api/admin/courses/:code', A('admin'), W((q, r) => {
  once(q, r, 'UPDATE COURSE ' + q.params.code, { code: q.params.code, ...q.body }, () => {
    const c = db.prepare('SELECT * FROM courses WHERE code=?').get(q.params.code); if (!c) return { s: 404, b: { message: 'Course not found' } };
    const cap = +q.body.capacity, used = c.capacity - c.available; if (!(cap >= used && cap > 0)) return { s: 400, b: { message: `Seat limit cannot be below enrolled students (${used})` } };
    db.prepare('UPDATE courses SET capacity=?,available=?,lecturer_id=? WHERE code=?').run(cap, cap - used, q.body.lecturer_id || null, c.code); return { s: 200, b: { message: 'Course updated' } };
  });
}));
router.delete('/api/admin/courses/:code', A('admin'), W((q, r) => once(q, r, 'REMOVE COURSE ' + q.params.code, { code: q.params.code }, () => { db.prepare('DELETE FROM courses WHERE code=?').run(q.params.code); return { s: 200, b: { message: 'Course deleted' } }; })));
router.get('/api/admin/registrations', A('admin'), W((q, r) => r.json(db.prepare("SELECT g.ref,g.created_at,u.name student,u.username,g.course_code,c.name course FROM registrations g JOIN users u ON u.id=g.student_id JOIN courses c ON c.code=g.course_code WHERE g.status='Registered' ORDER BY g.id DESC").all())));
router.get('/api/admin/diagnostics', A('admin'), W((q, r) => r.json({
  armed: sim.drop,
  totals: { registrations: db.prepare("SELECT COUNT(*) n FROM registrations WHERE status='Registered'").get().n, keys: db.prepare('SELECT COUNT(*) n FROM idem').get().n, duplicates: db.prepare('SELECT COALESCE(SUM(hits),0) n FROM idem').get().n, lost: db.prepare("SELECT COUNT(*) n FROM log WHERE outcome LIKE 'SAVED%'").get().n },
  consistency: db.prepare("SELECT code,capacity,available,(SELECT COUNT(*) FROM registrations g WHERE g.course_code=c.code AND g.status='Registered') active FROM courses c").all().map(c => ({ ...c, ok: c.capacity - c.available === c.active })),
  idem: db.prepare('SELECT k,status,hits,created_at FROM idem ORDER BY created_at DESC,rowid DESC LIMIT 15').all(),
  log: db.prepare('SELECT * FROM log ORDER BY id DESC LIMIT 30').all()
})));
router.post('/api/admin/arm', A('admin'), W((q, r) => once(q, r, 'ARM FAILURE SIMULATION', q.body, () => { sim.drop = +q.body.n || 0; return { s: 200, b: { armed: sim.drop } }; })));
router.post('/api/admin/reset', A('admin'), W((q, r) => once(q, r, 'RESET DEMO DATA', {}, () => { seed(); sim.drop = 0; return { s: 200, b: { message: 'Demo data reset' } }; })));

module.exports = router;
