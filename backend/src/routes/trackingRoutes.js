import { Router } from 'express';
import {
  startTrackingSession,
  pauseTrackingSession,
  resumeTrackingSession,
  uploadTrackingPoints,
  verifyCheckpointArrival,
  toggleLocationSharing,
  togglePublicRouteSummary,
  stopTrackingSession,
  listMyTrackingSessions,
  getTrackingSessionById,
} from '../controllers/trackingController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.use(protect, authorize('rider'));

router.get('/sessions', listMyTrackingSessions);
router.get('/sessions/:id', getTrackingSessionById);
router.post('/sessions/start', startTrackingSession);
router.patch('/sessions/:id/pause', pauseTrackingSession);
router.patch('/sessions/:id/resume', resumeTrackingSession);
router.post('/sessions/:id/points', uploadTrackingPoints);
router.post('/sessions/:id/checkpoints/:checkpointId/verify', verifyCheckpointArrival);
router.patch('/sessions/:id/sharing', toggleLocationSharing);
router.patch('/sessions/:id/public-route', togglePublicRouteSummary);
router.post('/sessions/:id/stop', stopTrackingSession);

export default router;

