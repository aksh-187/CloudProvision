'use strict';

/**
 * Validation middleware helpers.
 * Uses express-validator to check request bodies/params.
 * Route-specific validation chains are defined in Phase 3+ route files.
 *
 * This file exports a generic handler that reads the validation result
 * and returns 400 with the first error if validation fails.
 */

const { validationResult } = require('express-validator');

/**
 * Middleware that reads express-validator results.
 * Place after validation chains in a route definition:
 *
 *   router.post('/route', [...validators], handleValidationErrors, controller)
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: errors.array(),
    });
  }
  next();
}

module.exports = { handleValidationErrors };
