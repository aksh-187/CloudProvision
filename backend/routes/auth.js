'use strict';

/**
 * Authentication routes
 *
 * POST /api/auth/signup
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 */

const express                        = require('express');
const { body }                       = require('express-validator');
const { handleValidationErrors }     = require('../middleware/validate');
const { requireAuth }                = require('../middleware/auth');
const { signup, login, logout, me }  = require('../controllers/authController');

const router = express.Router();

// ── Validation chains ──────────────────────────────────────────────────────────

const signupValidators = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email address is required.')
    .isLength({ max: 254 }).withMessage('Email must be 254 characters or fewer.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 72 }).withMessage('Password must be 72 characters or fewer.'),
    // bcrypt silently truncates at 72 bytes — enforce this as a hard limit
    // to avoid user confusion about which password actually works.
];

const loginValidators = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.'),
];

// ── Routes ─────────────────────────────────────────────────────────────────────

router.post('/signup',
  signupValidators,
  handleValidationErrors,
  signup
);

router.post('/login',
  loginValidators,
  handleValidationErrors,
  login
);

router.post('/logout',
  logout
);

router.get('/me',
  requireAuth,
  me
);

module.exports = router;
