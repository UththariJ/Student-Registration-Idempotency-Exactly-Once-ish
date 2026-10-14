// Role-based access control + error wrapper.
const sessions = new Map();
// Every protected route declares the roles allowed; the server checks the token's role, not the login page used.
const A = (...roles) => (q, r, n) => { const u = sessions.get((q.get('Authorization') || '').slice(7)); if (!u) return r.status(401).json({ message: 'Please sign in' }); if (!roles.includes(u.role)) return r.status(403).json({ message: 'Forbidden for your role' }); q.user = u; n(); };
const W = f => (q, r) => { try { f(q, r); } catch (e) { r.status(String(e.code).startsWith('SQLITE_CONSTRAINT') ? 409 : 500).json({ message: e.message }); } };

module.exports = { sessions, A, W };
