import Subscription from '../models/Subscription.js';

export default async (req, res, next) => {
  try {
    // Developers bypass subscription check
    if (req.user.role === 'developer') return next();

    // Check if user has businessId
    if (!req.user.businessId) {
      return res.status(403).json({ message: 'No business associated with user' });
    }

    // Fetch subscription by businessId
    const subscription = await Subscription.findOne({ 
      businessId: req.user.businessId 
    });

    // No subscription found
    if (!subscription) {
      return res.status(402).json({ message: 'No active subscription found' });
    }

    // Subscription inactive
    if (!subscription.active) {
      return res.status(402).json({ message: 'Subscription inactive' });
    }

    // Subscription expired
    if (subscription.expiresAt < new Date()) {
      // Optional: auto-disable expired subscription
      subscription.active = false;
      await subscription.save();
      
      return res.status(402).json({ message: 'Subscription expired' });
    }

    // Attach subscription to request for downstream use
    req.subscription = subscription;

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ message: 'Subscription validation failed' });
  }
};