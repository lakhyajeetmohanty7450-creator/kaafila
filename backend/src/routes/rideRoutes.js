import { Router } from 'express';
import {
  listRides,
  getRideBySlug,
  createRide,
  updateRide,
  deleteRide,
  participateInRide,
  getRideParticipants,
  updateRideParticipantStatus,
} from '../controllers/rideController.js';
import {
  getRideRouteAndCheckpoints,
  updateRideRoute,
  createCheckpoint,
  updateCheckpoint,
  deleteCheckpoint,
  reorderCheckpoints,
  getOrganisationRideTrackingOverview,
} from '../controllers/routeController.js';
import { protect, authorize, optionalProtect } from '../middleware/auth.js';

const router = Router();

router.get('/', listRides);
router.get('/:slugOrId/route', optionalProtect, getRideRouteAndCheckpoints);
router.get('/:slugOrId', optionalProtect, getRideBySlug);

router.post('/', protect, authorize('organisation', 'admin'), createRide);
router.put('/:id', protect, authorize('organisation', 'admin'), updateRide);
router.delete('/:id', protect, authorize('organisation', 'admin'), deleteRide);

router.put('/:id/route', protect, authorize('organisation', 'admin'), updateRideRoute);
router.post('/:id/checkpoints', protect, authorize('organisation', 'admin'), createCheckpoint);
router.put('/:id/checkpoints/reorder', protect, authorize('organisation', 'admin'), reorderCheckpoints);
router.put('/:id/checkpoints/:checkpointId', protect, authorize('organisation', 'admin'), updateCheckpoint);
router.delete('/:id/checkpoints/:checkpointId', protect, authorize('organisation', 'admin'), deleteCheckpoint);
router.get('/:id/tracking-overview', protect, authorize('organisation', 'admin'), getOrganisationRideTrackingOverview);

router.post('/:id/participate', protect, authorize('rider'), participateInRide);
router.get('/:id/participants', protect, authorize('organisation', 'admin'), getRideParticipants);
router.patch('/:id/participants/:memberId', protect, authorize('organisation', 'admin'), updateRideParticipantStatus);

export default router;
