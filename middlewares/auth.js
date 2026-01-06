import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Business from '../models/Business.js';

export default async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'User account is inactive' });
    }

    // Developers can proceed without business check
    if (user.role === 'developer') {
      req.user = user;
      return next();
    }

    // Check if user has a business
    if (!user.businessId) {
      return res.status(403).json({ message: 'No business associated with user' });
    }

    // Fetch and check business status
    const business = await Business.findById(user.businessId);
    
    if (!business) {
      return res.status(403).json({ message: 'Business not found' });
    }

    if (!business.isActive) {
      return res.status(403).json({ message: 'Business is inactive' });
    }

    // Attach both user and business to request
    req.user = user;
    req.business = business;

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    console.error('Authentication error:', err);
    return res.status(500).json({ message: 'Authentication failed' });
  }
};