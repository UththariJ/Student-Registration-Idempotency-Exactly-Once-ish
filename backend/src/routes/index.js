const router = require('express').Router();
['auth', 'student', 'lecturer', 'admin'].forEach(n => router.use(require('./' + n)));
module.exports = router;
