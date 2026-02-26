import Plan from "../models/Plan.js";
import { PLAN_DEFS, PLAN_ORDER } from "../config/plans.js";

function defaultsToRows() {
  return PLAN_ORDER.map((id, index) => {
    const item = PLAN_DEFS[id];
    return {
      id: item.id,
      name: item.name,
      price: Number(item.price || 0),
      durationDays: Number(item.durationDays || 30),
      features: {
        invoice_banner: Boolean(item?.features?.invoice_banner),
        invoice_image_upload: Boolean(item?.features?.invoice_image_upload),
      },
      limits: {
        users: Number(item?.limits?.users || 1),
      },
      sortOrder: index,
      isActive: true,
    };
  });
}

export async function ensureDefaultPlans() {
  const rows = defaultsToRows();
  if (rows.length === 0) return;
  const existing = await Plan.find({ id: { $in: rows.map((r) => r.id) } }).select("id").lean();
  const existingIds = new Set(existing.map((item) => item.id));
  const missing = rows.filter((row) => !existingIds.has(row.id));
  if (missing.length > 0) {
    await Plan.insertMany(missing);
  }
}

export async function getAllPlans({ includeInactive = false } = {}) {
  await ensureDefaultPlans();
  const filter = includeInactive ? {} : { isActive: true };
  return Plan.find(filter).sort({ sortOrder: 1, id: 1 }).lean();
}

export async function getPlanById(planId) {
  await ensureDefaultPlans();
  const normalized = typeof planId === "string" && planId.trim() ? planId.trim().toLowerCase() : "trial";
  const plan = await Plan.findOne({ id: normalized, isActive: true }).lean();
  if (plan) return plan;
  return Plan.findOne({ id: "trial" }).lean();
}

export async function isFeatureEnabled(planId, featureKey) {
  const plan = await getPlanById(planId);
  return Boolean(plan?.features?.[featureKey]);
}
