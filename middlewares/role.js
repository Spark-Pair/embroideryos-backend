import { getBusinessRuleContextByBusinessId, roleHasBusinessAccess } from "../utils/businessRuleData.js";

export default function allowedRoles(roles = [], options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });

      if (Array.isArray(roles) && roles.includes(req.user.role)) {
        return next();
      }

      if (req.user.role === "developer") {
        return res.status(403).json({ message: "Access denied", code: "ACCESS_DENIED" });
      }

      if (options?.accessKey) {
        const context = await getBusinessRuleContextByBusinessId(req.user?.businessId);
        if (roleHasBusinessAccess(context, options.accessKey, req.user.role)) {
          return next();
        }
      }

      return res.status(403).json({ message: "Access denied", code: "ACCESS_DENIED" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to verify access" });
    }
  };
}
