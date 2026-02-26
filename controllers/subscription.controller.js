import Subscription from "../models/Subscription.js";
import Business from "../models/Business.js";
import { PLAN_DEFS, PLAN_ORDER, getPlan } from "../config/plans.js";
import mongoose from "mongoose";

const normalizePlanId = (value) => {
  if (!value || typeof value !== "string") return "trial";
  const key = value.trim().toLowerCase();
  return PLAN_DEFS[key] ? key : "trial";
};

const STATUS_SET = new Set(["trial", "active", "past_due", "canceled", "expired"]);

export const getPlans = async (_req, res) => {
  return res.json({
    success: true,
    data: PLAN_ORDER.map((id) => PLAN_DEFS[id]),
  });
};

export const getMySubscription = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ message: "Business ID missing" });

    const subscription = await Subscription.findOne({ businessId }).lean();
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    return res.json({
      success: true,
      data: {
        ...subscription,
        plan_details: getPlan(subscription.plan),
      },
    });
  } catch (err) {
    console.error("getMySubscription:", err);
    return res.status(500).json({ message: "Failed to fetch subscription" });
  }
};

export const listSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 30, plan, status, businessId } = req.query;
    const filter = {};

    if (plan) filter.plan = normalizePlanId(plan);
    if (status) filter.status = status;
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      filter.businessId = new mongoose.Types.ObjectId(businessId);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await Subscription.countDocuments(filter);
    const data = await Subscription.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const businessIds = data.map((item) => item.businessId);
    const businesses = await Business.find({ _id: { $in: businessIds } })
      .select("name")
      .lean();
    const businessMap = new Map(businesses.map((b) => [String(b._id), b]));

    const enriched = data.map((item) => ({
      ...item,
      business_name: businessMap.get(String(item.businessId))?.name || "",
      plan_details: getPlan(item.plan),
    }));

    return res.json({
      success: true,
      data: enriched,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        totalItems: total,
        itemsPerPage: parsedLimit,
      },
    });
  } catch (err) {
    console.error("listSubscriptions:", err);
    return res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
};

export const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, status, active, expiresAt } = req.body;
    const subscription = await Subscription.findById(id);
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    if (plan) subscription.plan = normalizePlanId(plan);
    if (status && STATUS_SET.has(status)) subscription.status = status;
    if (active !== undefined) subscription.active = Boolean(active);
    if (expiresAt) subscription.expiresAt = new Date(expiresAt);

    await subscription.save();

    return res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        plan_details: getPlan(subscription.plan),
      },
    });
  } catch (err) {
    console.error("updateSubscription:", err);
    return res.status(500).json({ message: "Failed to update subscription" });
  }
};
