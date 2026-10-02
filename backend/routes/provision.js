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
  ALLOWED_RDS_INSTANCE_CLASSES,
  ALLOWED_RDS_ENGINES,
}                                = require('../utils/sanitize');

const router = express.Router();

// ── Validation chains ──────────────────────────────────────────────────────────

const provisionValidators = [
  body('resourceType')
    .notEmpty().withMessage('resourceType is required.')
    .isIn(['ec2', 's3', 'rds']).withMessage("resourceType must be 'ec2', 's3', or 'rds'."),

  // ── EC2 fields ──
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

  // ── S3 fields ──
  body('config.bucketName')
    .optional()
    .isLength({ min: 3, max: 36 }).withMessage('config.bucketName must be 3–36 characters.')
    .matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).withMessage('config.bucketName must be lowercase letters, numbers, and hyphens only.'),

  // ── RDS fields ──
  body('config.dbEngine')
    .optional()
    .isIn(ALLOWED_RDS_ENGINES)
    .withMessage(`config.dbEngine must be one of: ${ALLOWED_RDS_ENGINES.join(', ')}`),

  body('config.dbInstanceClass')
    .optional()
    .isIn(ALLOWED_RDS_INSTANCE_CLASSES)
    .withMessage(`config.dbInstanceClass must be one of: ${ALLOWED_RDS_INSTANCE_CLASSES.join(', ')}`),

  body('config.dbName')
    .optional()
    .isLength({ max: 64 }).withMessage('config.dbName must be 64 characters or fewer.')
    .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/).withMessage('config.dbName must start with a letter and contain only letters, numbers, underscores.'),

  body('config.dbUsername')
    .optional()
    .isLength({ min: 1, max: 16 }).withMessage('config.dbUsername must be 1–16 characters.')
    .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/).withMessage('config.dbUsername must start with a letter.'),

  body('config.dbStorage')
    .optional()
    .isInt({ min: 20, max: 100 }).withMessage('config.dbStorage must be between 20 and 100 GB.'),
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
