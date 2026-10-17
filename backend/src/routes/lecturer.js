const router = require('express').Router();
const { db } = require('../db');
const { A, W } = require('../middleware');
const { own, notify } = require('../helpers');
const { once } = require('../idempotency');

// ===== Lecturer =====
router.get('/api/lecturer/courses', A('lecturer'), W((q, r) => r.json(db.prepare('SELECT * FROM courses WHERE lecturer_id=?').all(q.user.id).map(c => ({
  ...c,
  students: db.prepare("SELECT u.name,u.username,g.ref FROM registrations g JOIN users u ON u.id=g.student_id WHERE g.course_code=? AND g.status='Registered'").all(c.code),
  content: db.prepare('SELECT c.*,(SELECT COUNT(*) FROM submissions s WHERE s.content_id=c.id) subs FROM content c WHERE course_code=? ORDER BY id').all(c.code)
})))));
router.post('/api/content', A('lecturer'), W((q, r) => {
  once(q, r, 'PUBLISH CONTENT', q.body, () => {
    const { courseCode, type, title, body, summary, videoUrl, documentUrl, durationMinutes, instructions, due, timeLimitMinutes, maxAttempts, passingScore, points, submissionType } = q.body;
    if (!own(q.user, courseCode)) return { s: 403, b: { message: 'That is not your course' } };
    if (!['note', 'quiz', 'assignment'].includes(type) || !title) return { s: 400, b: { message: 'Type and title are required' } };
    if (type === 'note' && !summary) return { s: 400, b: { message: 'A lecture note summary is required' } };
    if (type === 'quiz' && (!(timeLimitMinutes > 0) || !(maxAttempts > 0) || !(passingScore >= 0 && passingScore <= 100) || !(points > 0))) return { s: 400, b: { message: 'Quiz time limit, attempts, passing score and points are required' } };
    if (type === 'assignment' && (!instructions || !due || !(points > 0) || !['text', 'file', 'text-file'].includes(submissionType))) return { s: 400, b: { message: 'Assignment instructions, deadline, points and submission type are required' } };
    db.prepare(`INSERT INTO content(course_code,type,title,body,due,summary,video_url,document_url,duration_minutes,instructions,time_limit_minutes,max_attempts,passing_score,points,submission_type)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(courseCode, type, title, body || '', due || null, summary || '', videoUrl || null, documentUrl || null, durationMinutes || null, instructions || '', timeLimitMinutes || null, maxAttempts || null, passingScore ?? null, points || null, submissionType || 'text');
    return { s: 201, b: { message: 'Added' } };
  });
}));
router.get('/api/lecturer/submissions/:cid', A('lecturer'), W((q, r) => {
  const x = db.prepare('SELECT * FROM content WHERE id=?').get(q.params.cid); if (!x || !own(q.user, x.course_code)) return r.status(403).json({ message: 'Not your course' });
  r.json({ content: x, subs: db.prepare('SELECT s.*,u.name student FROM submissions s JOIN users u ON u.id=s.student_id WHERE content_id=?').all(x.id) });
}));
router.put('/api/submissions/:id/grade', A('lecturer'), W((q, r) => {
  once(q, r, 'GRADE SUBMISSION ' + q.params.id, { id: q.params.id, ...q.body }, () => {
    const s = db.prepare('SELECT s.*,c.course_code,c.title FROM submissions s JOIN content c ON c.id=s.content_id WHERE s.id=?').get(q.params.id);
    if (!s || !own(q.user, s.course_code)) return { s: 403, b: { message: 'Not your course' } };
    const g = +q.body.grade; if (!(g >= 0 && g <= 100)) return { s: 400, b: { message: 'Grade must be 0–100' } };
    db.prepare('UPDATE submissions SET grade=?,feedback=? WHERE id=?').run(g, q.body.feedback || '', s.id); notify(s.student_id, `"${s.title}" was marked: ${g}/100.`); return { s: 200, b: { message: 'Saved' } };
  });
}));

module.exports = router;
