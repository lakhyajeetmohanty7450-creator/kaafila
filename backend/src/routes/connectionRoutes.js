import { Router } from 'express';
import {
  listConnections,
  listConnectionRequests,
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  deleteConnection,
} from '../controllers/connectionController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.use(protect, authorize('rider'));

router.get('/', listConnections);
router.get('/requests', listConnectionRequests);
router.post('/request/:riderId', sendConnectionRequest);
router.put('/:id/accept', acceptConnectionRequest);
router.put('/:id/reject', rejectConnectionRequest);
router.delete('/:id', deleteConnection);

export default router;

