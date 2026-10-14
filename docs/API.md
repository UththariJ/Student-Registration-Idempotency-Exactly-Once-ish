# API reference
All routes except login need `Authorization: Bearer <token>`. Role is enforced server-side (`401` not signed in, `403` wrong role).
Routes marked 🔑 also require an `Idempotency-Key` header.

| Method & path | Role | Purpose |
|---|---|---|
| POST `/api/login` `{username,password,portal}` | – | Sign in (portal must match the user's role) |
| GET `/api/courses` | any | Courses with seats, lecturer, caller's registration ref |
| POST `/api/registrations` 🔑 `{courseCode}` | student | Register (201 created · 200 replayed · 409 full/duplicate · 422 key reuse) |
| DELETE `/api/registrations/:id` | student | Drop course, release seat |
| GET `/api/my/registrations` · `/api/my/content` | student | Registered courses; notes, quizzes, assignments |
| POST `/api/assignments/:id/submit` 🔑 `{text}` | student | Submit assignment + notification (exactly once) |
| GET `/api/my/notifications` · POST `/api/my/notifications/seen` | student | Notifications |
| GET `/api/lecturer/courses` | lecturer | Assigned courses, class lists, content |
| POST `/api/content` | lecturer | Add note / quiz / assignment (own courses only) |
| GET `/api/lecturer/submissions/:contentId` | lecturer | Submissions to mark |
| PUT `/api/submissions/:id/grade` | lecturer | Mark + notify student |
| GET/POST `/api/admin/users` · DELETE `/api/admin/users/:id` | admin | Manage students & lecturers |
| POST/PUT/DELETE `/api/admin/courses[/:code]` | admin | Courses, seat limits, lecturer assignment |
| GET `/api/admin/registrations` | admin | All active registrations (class lists) |
| GET `/api/admin/diagnostics` | admin | Idempotency store, request log, seat consistency, counters |
| POST `/api/admin/arm` `{n}` · `/api/admin/reset` | admin | Failure simulation · reset demo data |
