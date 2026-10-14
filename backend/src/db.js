// Database connection, schema and demo seed data.
const Database = require('better-sqlite3'), crypto = require('crypto'), path = require('path'), fs = require('fs');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'unireg.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE); db.pragma('journal_mode=WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,pw TEXT,role TEXT,name TEXT,email TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_username ON users(lower(trim(username)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_name ON users(lower(trim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email ON users(lower(trim(email)));
CREATE TABLE IF NOT EXISTS courses(code TEXT PRIMARY KEY,name TEXT,credits INT,capacity INT,available INT,lecturer_id INT);
-- A course name identifies one module; different index codes cannot duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_name ON courses(lower(trim(name)));
CREATE TABLE IF NOT EXISTS registrations(id INTEGER PRIMARY KEY,ref TEXT,student_id INT,course_code TEXT,status TEXT DEFAULT 'Registered',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
-- Layer 2: the database itself forbids a second ACTIVE registration for the same student+course
CREATE UNIQUE INDEX IF NOT EXISTS uq_active ON registrations(student_id,course_code) WHERE status='Registered';
-- Layer 1: idempotency store (key -> request fingerprint + stored response)
CREATE TABLE IF NOT EXISTS idem(k TEXT PRIMARY KEY,hash TEXT,status INT,response TEXT,hits INT DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS content(id INTEGER PRIMARY KEY,course_code TEXT,type TEXT,title TEXT,body TEXT,due TEXT);
CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY,content_id INT,student_id INT,text TEXT,ref TEXT,grade INT,feedback TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(content_id,student_id));
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INT,message TEXT,seen INT DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS log(id INTEGER PRIMARY KEY,ts TEXT DEFAULT CURRENT_TIMESTAMP,who TEXT,action TEXT,k TEXT,outcome TEXT);`);

const contentColumns = [
  ['summary', "TEXT DEFAULT ''"],
  ['video_url', 'TEXT'],
  ['document_url', 'TEXT'],
  ['duration_minutes', 'INTEGER'],
  ['instructions', "TEXT DEFAULT ''"],
  ['time_limit_minutes', 'INTEGER'],
  ['max_attempts', 'INTEGER'],
  ['passing_score', 'INTEGER'],
  ['points', 'INTEGER'],
  ['submission_type', "TEXT DEFAULT 'text'"]
];
const contentColumnNames = new Set(db.prepare('PRAGMA table_info(content)').all().map(column => column.name));
for (const [name, definition] of contentColumns) {
  if (!contentColumnNames.has(name)) db.exec(`ALTER TABLE content ADD COLUMN ${name} ${definition}`);
}

// LMS domain tables. The existing content/submissions tables remain supported for
// backward compatibility with the current portal while these tables model newer
// LMS features explicitly.
db.exec(`
CREATE TABLE IF NOT EXISTS lessons(
  id INTEGER PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  video_url TEXT,
  document_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_position ON lessons(course_code,position);

CREATE TABLE IF NOT EXISTS quizzes(
  id INTEGER PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due TEXT,
  time_limit_minutes INTEGER,
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quiz_questions(
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer TEXT,
  points INTEGER NOT NULL DEFAULT 1 CHECK(points > 0),
  position INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_position ON quiz_questions(quiz_id,position);
CREATE TABLE IF NOT EXISTS quiz_attempts(
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}',
  score INTEGER CHECK(score >= 0),
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_student ON quiz_attempts(quiz_id,student_id);

CREATE TABLE IF NOT EXISTS progress(
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  completed_at TEXT,
  UNIQUE(student_id,course_code,lesson_id,content_id)
);
CREATE INDEX IF NOT EXISTS ix_progress_student_course ON progress(student_id,course_code);

CREATE TABLE IF NOT EXISTS live_classes(
  id INTEGER PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  lecturer_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'custom',
  meeting_url TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS ix_live_classes_course_start ON live_classes(course_code,starts_at);

CREATE TABLE IF NOT EXISTS certificates(
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  certificate_no TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'Issued' CHECK(status IN ('Issued','Revoked')),
  UNIQUE(student_id,course_code)
);

CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT REFERENCES courses(code) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT UNIQUE,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Paid','Failed','Refunded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_payments_student_status ON payments(student_id,status);
`);


const H = p => crypto.scryptSync(p, 'unireg', 16).toString('hex'), day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
function seed() {
  ['log', 'notifications', 'submissions', 'content', 'idem', 'registrations', 'courses', 'users'].forEach(t => db.exec('DELETE FROM ' + t));
  const u = db.prepare('INSERT INTO users(username,pw,role,name,email) VALUES(?,?,?,?,?)');
  u.run('admin', H('admin123'), 'admin', 'Registrar Office', 'admin@uni.lk');
  u.run('lecturer1', H('lec123'), 'lecturer', 'Dr. Sunil Perera', 'sunil@uni.lk');
  u.run('lecturer2', H('lec123'), 'lecturer', 'Ms. Dilani Jayawardena', 'dilani@uni.lk');
  [['BIT0018', 'Nimal Perera'], ['BIT0020', 'Kasun Silva'], ['BIT0031', 'Amal Fernando']].forEach(([i, n]) => u.run(i, H('stu123'), 'student', n, i.toLowerCase() + '@uni.lk'));
  const c = db.prepare('INSERT INTO courses VALUES(?,?,?,?,?,?)');
  [['IT3103', 'Service Oriented Web Programming', 3, 40, 2], ['IT3182', 'Essentials of AI', 3, 30, 3], ['SE3104', 'Software Quality Assurance', 2, 35, 2], ['CS3101', 'Distributed Systems (Limited)', 3, 2, 3]].forEach(([a, b, d, e, f]) => c.run(a, b, d, e, e, f));
  const k = db.prepare('INSERT INTO content(course_code,type,title,body,due) VALUES(?,?,?,?,?)');
  k.run('IT3103', 'note', 'Week 1 – REST Fundamentals', 'Resources, HTTP verbs, status codes and idempotent methods (GET, PUT, DELETE).', null);
  k.run('IT3103', 'quiz', 'Quiz 1 – HTTP Basics', '10 MCQs on HTTP, attempted in class.', day(2));
  k.run('IT3103', 'assignment', 'Assignment 1 – Design a REST API', 'Describe the resources and endpoints of a small REST API of your choice.', day(5));
  k.run('IT3182', 'assignment', 'Assignment 1 – Search Algorithms', 'Compare BFS and A* on a grid problem.', day(9));
  k.run('SE3104', 'note', 'Testing Pyramid', 'Unit, integration and end-to-end tests.', null);
  k.run('CS3101', 'note', 'Delivery Guarantees', 'At-most-once, at-least-once and exactly-once(ish) processing.', null);
}
if (!db.prepare('SELECT 1 FROM users').get()) seed();


module.exports = { db, H, day, seed };
