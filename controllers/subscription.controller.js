import Subscription from "../models/Subscription.js";
import Business from "../models/Business.js";
import Plan from "../models/Plan.js";
import mongoose from "mongoose";
import { getAllPlans, getPlanById } from "../services/plan.service.js";

const normalizePlanId = (value) => {
  if (!value || typeof value !== "string") return "trial";
  return value.trim().toLowerCase();
};

const STATUS_SET = new Set(["trial", "active", "past_due", "canceled", "expired"]);

export const getPlans = async (_req, res) => {
  try {
    const plans = await getAllPlans({ includeInactive: true });
    return res.json({ success: true, data: plans });
  } catch (err) {
    console.error("getPlans:", err);
    return res.status(500).json({ message: "Failed to fetch plans" });
  }
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
        plan_details: await getPlanById(subscription.plan),
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

    const planMap = new Map((await getAllPlans({ includeInactive: true })).map((p) => [p.id, p]));

    const enriched = data.map((item) => ({
      ...item,
      business_name: businessMap.get(String(item.businessId))?.name || "",
      plan_details: planMap.get(item.plan) || null,
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
        plan_details: await getPlanById(subscription.plan),
      },
    });
  } catch (err) {
    console.error("updateSubscription:", err);
    return res.status(500).json({ message: "Failed to update subscription" });
  }
};

export const createSubscription = async (req, res) => {
  try {
    const { businessId, plan = "trial", status = "active", active = true, startsAt, expiresAt } = req.body;
    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const business = await Business.findById(businessId).lean();
    if (!business) return res.status(404).json({ message: "Business not found" });

    const planDoc = await getPlanById(plan);
    const startDate = startsAt ? new Date(startsAt) : new Date();
    const endDate = expiresAt
      ? new Date(expiresAt)
      : new Date(startDate.getTime() + Number(planDoc?.durationDays || 30) * 24 * 60 * 60 * 1000);

    const subscription = await Subscription.findOneAndUpdate(
      { businessId },
      {
        plan: planDoc?.id || "trial",
        status,
        active: Boolean(active),
        startsAt: startDate,
        expiresAt: endDate,
        canceledAt: null,
      },
      { new: true, upsert: true }
    );

    return res.status(201).json({
      success: true,
      data: {
        ...subscription.toObject(),
        plan_details: planDoc,
      },
    });
  } catch (err) {
    console.error("createSubscription:", err);
    return res.status(500).json({ message: "Failed to create subscription" });
  }
};

export const renewSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    const planId = normalizePlanId(req.body?.plan || subscription.plan);
    const planDoc = await getPlanById(planId);
    const durationDays = Number(planDoc?.durationDays || 30);
    const baseDate = subscription.expiresAt && subscription.expiresAt > new Date()
      ? new Date(subscription.expiresAt)
      : new Date();
    const newExpiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    subscription.plan = planDoc?.id || subscription.plan;
    subscription.status = "active";
    subscription.active = true;
    subscription.startsAt = new Date();
    subscription.expiresAt = newExpiry;
    subscription.canceledAt = null;
    await subscription.save();

    return res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        plan_details: planDoc,
      },
    });
  } catch (err) {
    console.error("renewSubscription:", err);
    return res.status(500).json({ message: "Failed to renew subscription" });
  }
};

export const createPlan = async (req, res) => {
  try {
    const payload = req.body || {};
    const id = normalizePlanId(payload.id);
    if (!id) return res.status(400).json({ message: "Plan id is required" });

    const existing = await Plan.findOne({ id });
    if (existing) return res.status(409).json({ message: "Plan id already exists" });

    const plan = await Plan.create({
      id,
      name: payload.name || id,
      price: Number(payload.price || 0),
      durationDays: Number(payload.durationDays || 30),
      features: {
        invoice_banner: Boolean(payload?.features?.invoice_banner),
        invoice_image_upload: Boolean(payload?.features?.invoice_image_upload),
      },
      limits: {
        users: Number(payload?.limits?.users || 1),
      },
      sortOrder: Number(payload.sortOrder || 99),
      isActive: payload.isActive !== false,
    });

    return res.status(201).json({ success: true, data: plan });
  } catch (err) {
    console.error("createPlan:", err);
    return res.status(500).json({ message: "Failed to create plan" });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const id = normalizePlanId(req.params.id);
    const plan = await Plan.findOne({ id });
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const payload = req.body || {};
    if (payload.name !== undefined) plan.name = payload.name;
    if (payload.price !== undefined) plan.price = Number(payload.price);
    if (payload.durationDays !== undefined) plan.durationDays = Number(payload.durationDays);
    if (payload.features?.invoice_banner !== undefined) {
      plan.features.invoice_banner = Boolean(payload.features.invoice_banner);
    }
    if (payload.features?.invoice_image_upload !== undefined) {
      plan.features.invoice_image_upload = Boolean(payload.features.invoice_image_upload);
    }
    if (payload.limits?.users !== undefined) {
      plan.limits.users = Number(payload.limits.users);
    }
    if (payload.sortOrder !== undefined) plan.sortOrder = Number(payload.sortOrder);
    if (payload.isActive !== undefined) plan.isActive = Boolean(payload.isActive);

    await plan.save();
    return res.json({ success: true, data: plan });
  } catch (err) {
    console.error("updatePlan:", err);
    return res.status(500).json({ message: "Failed to update plan" });
  }
};
