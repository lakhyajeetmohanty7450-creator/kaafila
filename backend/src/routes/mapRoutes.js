import { Router } from 'express';
import {
  getMapsOverview,
  getRideRouteAndCheckpoints,
} from '../controllers/routeController.js';
import { optionalProtect } from '../middleware/auth.js';

const router = Router();

router.get('/overview', getMapsOverview);
router.get('/expeditions/:slugOrId', optionalProtect, getRideRouteAndCheckpoints);

export default router;

