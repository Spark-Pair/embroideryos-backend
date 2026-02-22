import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Business from '../models/Business.js';
import SessionService from '../services/SessionService.js';

export default async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const sessionId = req.headers['x-session-id']; // Frontend sends this

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  if (!sessionId) {
    return res.status(401).json({ message: 'No session ID provided' });
  }

  try {
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate session in DB
    const session = await SessionService.validateSession(sessionId);
    if (!session) {
      return res.status(401).json({ 
        message: 'Invalid or expired session',
        code: 'SESSION_INVALID'
      });
    }

    // Verify session belongs to token user
    if (session.userId.toString() !== decoded.id) {
      return res.status(401).json({ 
        message: 'Session mismatch',
        code: 'SESSION_MISMATCH'
      });
    }

    // Fetch user
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      await SessionService.invalidateSession(sessionId);
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    // Developers bypass business check
    if (user.role === 'developer') {
      req.user = user;
      req.sessionId = sessionId;
      return next();
    }

    // Business users: check business
    if (!user.businessId) {
      return res.status(403).json({ message: 'No business associated' });
    }

    const business = await Business.findById(user.businessId);
    if (!business || !business.isActive) {
      return res.status(403).json({ message: 'Business not found or inactive' });
    }

    req.user = user;
    req.business = business;
    req.sessionId = sessionId;

    if (req.body && typeof req.body === 'object') {
      req.body.businessId = business._id;
    }
    
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ message: 'Authentication failed' });
  }
};