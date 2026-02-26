import { isFeatureEnabled } from "../config/plans.js";

export const requireFeature = (featureKey) => (req, res, next) => {
  try {
    if (req.user?.role === "developer") return next();
    const planId = req.subscription?.plan || "trial";
    if (isFeatureEnabled(planId, featureKey)) return next();
    return res.status(402).json({ message: "Upgrade required for this feature" });
  } catch (err) {
    console.error("featureGate:", err);
    return res.status(500).json({ message: "Feature validation failed" });
  }
};
