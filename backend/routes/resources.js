'use strict';

/**
 * Resource and activity routes
 *
 * GET /api/resources  — list user's provisioned resources
 * GET /api/activity   — list user's activity log
 * GET /api/stats      — dashboard stats
 *
 * All routes require authentication.
 */

const express                      = require('express');
const { requireAuth }              = require('../middleware/auth');
const { getResources, getActivity, getStats } = require('../controllers/resourceController');

const router = express.Router();

router.get('/resources', requireAuth, getResources);
router.get('/activity',  requireAuth, getActivity);
router.get('/stats',     requireAuth, getStats);

module.exports = router;
