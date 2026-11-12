import { Router } from 'express';
import {
  getMapsOverview,
  getRideRouteAndCheckpoints,
  geocodeLocation,
  calculateMotorcycleRoute,
} from '../controllers/routeController.js';
import { optionalProtect, protect } from '../middleware/auth.js';
import { mapsProxyLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/overview', getMapsOverview);
router.get('/expeditions/:slugOrId', optionalProtect, getRideRouteAndCheckpoints);
router.get('/geocode', protect, mapsProxyLimiter, geocodeLocation);
router.post('/route', protect, mapsProxyLimiter, calculateMotorcycleRoute);

export default router;

