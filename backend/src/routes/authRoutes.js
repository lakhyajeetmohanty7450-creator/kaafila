import { Router } from 'express';
import { registerRider, registerOrganisation, login, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register/rider', authLimiter, registerRider);
router.post('/register/organisation', authLimiter, registerOrganisation);
router.post('/login', authLimiter, login);
router.get('/me', protect, getMe);

export default router;

