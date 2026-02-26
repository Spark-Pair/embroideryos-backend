import Subscription from "../models/Subscription.js";
import Business from "../models/Business.js";
import { getPlanById } from "../services/plan.service.js";

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
      const plan = await getPlanById("trial");
      subscription = await Subscription.create({
        businessId: req.user.businessId,
        plan: plan?.id || "trial",
        status: "trial",
        active: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + Number(plan?.durationDays || 7) * 24 * 60 * 60 * 1000),
      });
    }

    const now = new Date();
    const isExpired = Boolean(subscription.expiresAt && new Date(subscription.expiresAt) < now);
    const isReadMethod = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";

    if (isExpired || subscription.status === "expired") {
      if (subscription.status !== "expired" || subscription.active !== false) {
        subscription.active = false;
        subscription.status = "expired";
        await subscription.save();
      }

      req.subscription = subscription;
      req.plan = await getPlanById(subscription.plan);
      req.readOnlyMode = true;

      if (isReadMethod) {
        return next();
      }

      return res.status(402).json({
        message: "Subscription expired. Account is in read-only mode.",
        code: "SUBSCRIPTION_EXPIRED_READ_ONLY",
        readOnly: true,
        expiresAt: subscription.expiresAt,
      });
    }

    // Subscription inactive (non-expired states like canceled)
    if (!subscription.active || subscription.status === "canceled") {
      return res.status(402).json({ message: "Subscription inactive" });
    }

    // Attach subscription to request for downstream use
    req.subscription = subscription;
    req.plan = await getPlanById(subscription.plan);
    req.readOnlyMode = false;

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ message: 'Subscription validation failed' });
  }
};
