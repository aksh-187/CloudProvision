'use strict';

/**
 * Resource and activity routes — stub.
 * Full implementation in Phase 6+.
 *
 * GET /api/resources
 * GET /api/activity
 */

const express = require('express');
const router = express.Router();

router.get('/resources', (_req, res) => res.status(501).json({ error: 'Not implemented yet.' }));
router.get('/activity',  (_req, res) => res.status(501).json({ error: 'Not implemented yet.' }));

module.exports = router;
