import { Router } from 'express';
import {
  registerRider,
  registerOrganisation,
  login,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register/rider', authLimiter, registerRider);
router.post('/register/organisation', authLimiter, registerOrganisation);
router.post('/login', authLimiter, login);
router.post('/logout', protect, logout);
router.post('/change-password', authLimiter, protect, changePassword);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);
router.get('/me', protect, getMe);

export default router;

