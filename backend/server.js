// Entry point: Express app = REST API + static frontend.
const express = require('express'), path = require('path');
const app = express(); app.use(express.json());
app.use(require('./src/routes'));
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));
app.get(/^\/(student|admin|lecturer)(\/.*)?$/, (q, r) => r.sendFile(path.join(FRONTEND, 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UniReg → http://localhost:${PORT}  (portals: /student/login /lecturer/login /admin/login)`));
