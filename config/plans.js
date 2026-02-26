export const PLAN_DEFS = {
  trial: {
    id: "trial",
    name: "Trial",
    price: 0,
    durationDays: 7,
    features: {
      invoice_banner: false,
      invoice_image_upload: false,
    },
    limits: {
      users: 1,
    },
  },
  basic: {
    id: "basic",
    name: "Basic",
    price: 2500,
    durationDays: 30,
    features: {
      invoice_banner: false,
      invoice_image_upload: false,
    },
    limits: {
      users: 2,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 5000,
    durationDays: 30,
    features: {
      invoice_banner: true,
      invoice_image_upload: false,
    },
    limits: {
      users: 5,
    },
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: 9000,
    durationDays: 30,
    features: {
      invoice_banner: true,
      invoice_image_upload: true,
    },
    limits: {
      users: 5,
    },
  },
};

export const PLAN_ORDER = ["trial", "basic", "pro", "premium"];

export function getPlan(planId) {
  return PLAN_DEFS[planId] || PLAN_DEFS.trial;
}

export function isFeatureEnabled(planId, featureKey) {
  const plan = getPlan(planId);
  return Boolean(plan?.features?.[featureKey]);
}
