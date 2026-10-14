const router = require('express').Router();
const { db, day } = require('../db');
const crypto = require('crypto');
const { A, W } = require('../middleware');
const { notify } = require('../helpers');
const { once } = require('../idempotency');

// ===== Student =====
router.get('/api/courses', A('student', 'lecturer', 'admin'), W((q, r) => r.json(db.prepare("SELECT c.*,u.name lecturer,(SELECT ref FROM registrations g WHERE g.course_code=c.code AND g.student_id=? AND g.status='Registered') myref FROM courses c LEFT JOIN users u ON u.id=c.lecturer_id ORDER BY code").all(q.user.id))));
router.post('/api/registrations', A('student'), W((q, r) => {
  const code = q.body.courseCode, sid = q.user.id;
  once(q, r, 'REGISTER ' + code, { sid, code }, () => {
    if (!db.prepare('SELECT 1 FROM courses WHERE code=?').get(code)) return { s: 404, b: { message: 'Course not found' } };
    if (db.prepare("SELECT 1 FROM registrations WHERE student_id=? AND course_code=? AND status='Registered'").get(sid, code)) return { s: 409, b: { message: 'You are already registered for this course.' } };
    if (!db.prepare('UPDATE courses SET available=available-1 WHERE code=? AND available>0').run(code).changes) return { s: 409, b: { message: 'This course is full.' } };
    const ref = 'REG-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare('INSERT INTO registrations(ref,student_id,course_code) VALUES(?,?,?)').run(ref, sid, code);
    return { s: 201, b: { message: 'Registration confirmed.', ref, courseCode: code } };
  });
}));
router.get('/api/my/registrations', A('student'), W((q, r) => r.json(db.prepare("SELECT g.id,g.ref,g.course_code,c.name,c.credits FROM registrations g JOIN courses c ON c.code=g.course_code WHERE g.student_id=? AND g.status='Registered' ORDER BY g.id").all(q.user.id))));
router.delete('/api/registrations/:id', A('student'), W((q, r) => once(q, r, 'DROP REGISTRATION ' + q.params.id, { id: q.params.id }, () => db.transaction(() => {
  const g = db.prepare("SELECT * FROM registrations WHERE id=? AND student_id=? AND status='Registered'").get(q.params.id, q.user.id);
  if (!g) return { s: 404, b: { message: 'Registration not found' } };
  db.prepare("UPDATE registrations SET status='Cancelled' WHERE id=?").run(g.id); db.prepare('UPDATE courses SET available=available+1 WHERE code=?').run(g.course_code);
  return { s: 200, b: { message: 'Course dropped; seat released.' } };
})())));
router.get('/api/my/content', A('student'), W((q, r) => r.json(db.prepare("SELECT c.*,s.ref sref,s.grade,s.feedback FROM content c JOIN registrations g ON g.course_code=c.course_code AND g.student_id=? AND g.status='Registered' LEFT JOIN submissions s ON s.content_id=c.id AND s.student_id=? ORDER BY c.due IS NULL,c.due,c.id").all(q.user.id, q.user.id))));
router.post('/api/assignments/:id/submit', A('student'), W((q, r) => {
  const id = +q.params.id, sid = q.user.id, text = (q.body.text || '').trim();
  if (!text) return r.status(400).json({ message: 'Please write your answer first' });
  once(q, r, 'SUBMIT #' + id, { sid, id, text }, () => {
    const a = db.prepare("SELECT c.* FROM content c JOIN registrations g ON g.course_code=c.course_code AND g.student_id=? AND g.status='Registered' WHERE c.id=? AND c.type='assignment'").get(sid, id);
    if (!a) return { s: 404, b: { message: 'Assignment not found in your courses' } };
    if (a.due && a.due < day(0)) return { s: 409, b: { message: 'The deadline has passed.' } };
    if (db.prepare('SELECT 1 FROM submissions WHERE content_id=? AND student_id=?').get(id, sid)) return { s: 409, b: { message: 'You have already submitted this assignment.' } };
    const ref = 'SUB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare('INSERT INTO submissions(content_id,student_id,text,ref) VALUES(?,?,?,?)').run(id, sid, text, ref);
    notify(sid, `✅ Your assignment "${a.title}" was submitted successfully. Reference ${ref}.`); // inside the same transaction → sent exactly once
    return { s: 201, b: { message: 'Assignment submitted successfully.', ref } };
  });
}));
router.get('/api/my/notifications', A('student'), W((q, r) => r.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30').all(q.user.id))));
router.post('/api/my/notifications/seen', A('student'), W((q, r) => { db.prepare('UPDATE notifications SET seen=1 WHERE user_id=?').run(q.user.id); r.json({ ok: 1 }); }));

module.exports = router;
