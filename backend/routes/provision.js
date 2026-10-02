'use strict';

/**
 * Provisioning routes
 *
 * POST /api/provision        — create a provisioning job
 * GET  /api/status/:jobId    — get job + resource status
 * POST /api/destroy/:jobId   — destroy a provisioned resource
 *
 * All routes require authentication (requireAuth).
 * Authorization (ownership checks) is enforced in the controller.
 */

const express                    = require('express');
const { body, param }            = require('express-validator');
const { handleValidationErrors } = require('../middleware/validate');
const { requireAuth }            = require('../middleware/auth');
const {
  provision,
  status,
  destroyResource,
}                                = require('../controllers/provisionController');
const {
  ALLOWED_REGIONS,
  ALLOWED_EC2_INSTANCE_TYPES,
}                                = require('../utils/sanitize');

const router = express.Router();

// ── Validation chains ──────────────────────────────────────────────────────────

const provisionValidators = [
  body('resourceType')
    .notEmpty().withMessage('resourceType is required.')
    .isIn(['ec2']).withMessage("resourceType must be 'ec2' (s3 and rds coming in later milestones)."),

  // EC2-specific config fields (present when resourceType === 'ec2')
  body('config.region')
    .optional()
    .isIn(ALLOWED_REGIONS)
    .withMessage(`config.region must be one of: ${ALLOWED_REGIONS.join(', ')}`),

  body('config.instanceType')
    .optional()
    .isIn(ALLOWED_EC2_INSTANCE_TYPES)
    .withMessage(`config.instanceType must be one of: ${ALLOWED_EC2_INSTANCE_TYPES.join(', ')}`),

  body('config.instanceName')
    .optional()
    .isLength({ max: 64 }).withMessage('config.instanceName must be 64 characters or fewer.')
    .matches(/^[a-zA-Z0-9_\- ]+$/).withMessage('config.instanceName may only contain letters, numbers, hyphens, underscores, and spaces.'),
];

const jobIdValidator = [
  param('jobId')
    .notEmpty().withMessage('jobId is required.')
    .isUUID().withMessage('jobId must be a valid UUID.'),
];

// ── Routes ─────────────────────────────────────────────────────────────────────

router.post('/provision',
  requireAuth,
  provisionValidators,
  handleValidationErrors,
  provision
);

router.get('/status/:jobId',
  requireAuth,
  jobIdValidator,
  handleValidationErrors,
  status
);

router.post('/destroy/:jobId',
  requireAuth,
  jobIdValidator,
  handleValidationErrors,
  destroyResource
);

module.exports = router;
