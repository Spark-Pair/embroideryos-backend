import { Router } from 'express';
import { login, me } from '../controllers/auth.controller.js';
import protect from '../middlewares/auth.js';
import subscription from '../middlewares/subscription.js';

const router = Router();

router.post('/login', login);

router.get('/me', protect, subscription, me);

export default router;
