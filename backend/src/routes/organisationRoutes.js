import { Router } from 'express';
import {
  listOrganisations,
  getOrganisationBySlug,
  updateOrganisation,
  createOrganisationReview,
  getMyOrganisationDashboard,
  getMyOrganisationParticipants,
  getMyOrganisationAnalytics,
} from '../controllers/organisationController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', listOrganisations);
router.get('/me/dashboard', protect, authorize('organisation'), getMyOrganisationDashboard);
router.get('/me/riders', protect, authorize('organisation'), getMyOrganisationParticipants);
router.get('/me/analytics', protect, authorize('organisation'), getMyOrganisationAnalytics);
router.get('/:slugOrId', getOrganisationBySlug);
router.put('/:id', protect, authorize('organisation', 'admin'), updateOrganisation);
router.post('/:id/reviews', protect, authorize('rider'), createOrganisationReview);

export default router;
