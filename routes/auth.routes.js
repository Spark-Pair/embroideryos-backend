import express from 'express';
import { 
  login, 
  forceLogin, 
  logout, 
  logoutAll, 
  me, 
  refreshToken,
  getSessions,
  revokeSession
} from '../controllers/auth.controller.js';
import authenticate from '../middlewares/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/force-login', forceLogin);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, me);
router.get('/sessions', authenticate, getSessions);
router.delete('/sessions/:sessionId', authenticate, revokeSession);

export default router;
