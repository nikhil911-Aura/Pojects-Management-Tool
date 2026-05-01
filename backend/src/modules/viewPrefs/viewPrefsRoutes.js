import { Router } from 'express';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { viewPrefsController } from './viewPrefsController.js';

const router = Router();

router.use(authenticate);

router.get('/:projectId', viewPrefsController.get);
router.put('/:projectId', viewPrefsController.upsert);

export default router;
