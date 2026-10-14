# 🎓 UniReg — Idempotent Course Registration

A university portal (Student · Lecturer · Admin) that demonstrates **Idempotency & Exactly-Once(ish) processing**.
A student registers, the server saves it, the response is lost, the student retries — and still ends up with **one** registration, **one** seat deducted, **one** confirmation.

## Project structure
```
course-registration/
├── backend/                     Node.js + Express + SQLite (REST API)
│   ├── server.js                Entry point (API + serves ../frontend)
│   ├── package.json
│   ├── .env.example
│   ├── data/                    SQLite database file is created here
│   └── src/
│       ├── db.js                Connection, schema, unique index, seed data
│       ├── middleware.js        Role-based access control (A), error wrapper (W), sessions
│       ├── helpers.js           Request log, lecturer-ownership check, notifications
│       ├── idempotency.js       ★ Generic idempotent executor + failure-simulation switch
│       └── routes/
│           ├── index.js         Mounts all routers
│           ├── auth.js          POST /api/login
│           ├── student.js       Courses, registration, content, submissions, notifications
│           ├── lecturer.js      Courses, content, submissions, marking
│           └── admin.js         Users, courses, registrations, diagnostics
├── frontend/                    Plain HTML/CSS/JS (no build step)
│   ├── index.html               Single page for all three portals
│   ├── css/styles.css
│   └── js/
│       ├── config.js            Portal detection, state, constants
│       ├── api.js               fetch helper, toast, small utilities
│       ├── idempotent.js        ★ Client side: hidden key per intent, reused on Retry
│       ├── shell.js             Login, navigation, notification bell
│       ├── student.js · lecturer.js · admin.js    Portal views
│       └── main.js              Boot
├── docs/API.md                  Endpoint reference
├── preview/preview.html         Browser-only demo (backend simulated in memory)
└── README.md
```

## Run
```bash
npm install
npm start          # http://localhost:3000
```

The commands above can be run from the repository root. If you prefer to work directly in the API project, the equivalent commands are:

```bash
cd backend
npm install
npm start          # http://localhost:3000
```
| Portal | URL | Demo login |
|---|---|---|
| Student | `/student/login` | `BIT0018` / `stu123` (also BIT0020, BIT0031) |
| Lecturer | `/lecturer/login` | `lecturer1` / `lec123` (also lecturer2) |
| Admin | `/admin/login` | `admin` / `admin123` |

## How the pattern works
1. Client generates an `Idempotency-Key` per intent (never shown to the student) and sends it with the request.
2. `backend/src/idempotency.js` runs **key lookup → business checks → writes → notification → key save** in one DB transaction.
3. Same key again → stored response is returned (`replayed: true`); nothing is written twice.
4. Same key + different body → `422`.
5. A second layer protects business facts even with a new key: a partial unique index (one active registration per student+course), a guarded seat decrement (`WHERE available>0`) and a unique submission per student+assignment.
6. Only successful results are stored, so a "course full" failure can still succeed on a later attempt.

## Presentation script
1. **Admin → Diagnostics** → *Lose next response*.
2. **Student** → Register. Server saves, connection drops → "We couldn't confirm your registration."
3. Click **Retry** → original confirmation returned.
4. **Student → My Learning**: one registration. **Admin → Registrations**: one row; Diagnostics shows the seat check ✓.
5. **Lecturer → My Courses**: student listed once.
6. **Diagnostics**: log shows `SAVED — response lost` → `REPLAYED stored response`; idempotency store shows one key with one replay.

The same flow works for assignment submission (notification is created exactly once).

## Notes
Demo-grade auth (in-memory sessions, scrypt with a fixed salt). Quizzes are published with due dates but not auto-graded; notes are text only.
