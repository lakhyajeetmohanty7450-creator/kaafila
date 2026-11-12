import { Router } from 'express';
import {
  listRiders,
  getRiderByHandle,
  getMyRiderDashboard,
  getMyRiderRides,
  updateMyRiderProfile,
} from '../controllers/riderController.js';
import { protect, authorize, optionalProtect } from '../middleware/auth.js';

const router = Router();

router.get('/', optionalProtect, listRiders);
router.get('/me/dashboard', protect, authorize('rider'), getMyRiderDashboard);
router.get('/me/rides', protect, authorize('rider'), getMyRiderRides);
router.put('/me/profile', protect, authorize('rider'), updateMyRiderProfile);
router.get('/:handle', optionalProtect, getRiderByHandle);

export default router;
