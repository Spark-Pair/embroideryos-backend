import Subscription from "../models/Subscription.js";
import Business from "../models/Business.js";
import { getPlan } from "../config/plans.js";

export default async (req, res, next) => {
  try {
    // Developers bypass subscription check
    if (req.user.role === 'developer') return next();

    // Check if user has businessId
    if (!req.user.businessId) {
      return res.status(403).json({ message: 'No business associated with user' });
    }

    const business = await Business.findById(req.user.businessId).select("isActive").lean();
    if (!business) {
      return res.status(403).json({ message: "Business not found" });
    }
    if (business.isActive === false) {
      return res.status(402).json({ message: "Business inactive" });
    }

    // Fetch subscription by businessId
    let subscription = await Subscription.findOne({
      businessId: req.user.businessId,
    });

    // No subscription found
    if (!subscription) {
      const plan = getPlan("trial");
      subscription = await Subscription.create({
        businessId: req.user.businessId,
        plan: plan.id,
        status: "trial",
        active: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      });
    }

    // Subscription inactive
    if (!subscription.active || subscription.status === "canceled") {
      return res.status(402).json({ message: "Subscription inactive" });
    }

    // Subscription expired
    if (subscription.expiresAt < new Date()) {
      // Optional: auto-disable expired subscription
      subscription.active = false;
      subscription.status = "expired";
      await subscription.save();
      
      return res.status(402).json({ message: 'Subscription expired' });
    }

    // Attach subscription to request for downstream use
    req.subscription = subscription;
    req.plan = getPlan(subscription.plan);

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ message: 'Subscription validation failed' });
  }
};
