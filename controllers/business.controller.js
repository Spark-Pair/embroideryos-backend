// controllers/business.controller.js
import Business from "../models/Business.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Invoice from "../models/Invoice.js";
import InvoiceCounter from "../models/InvoiceCounter.js";
import mongoose from "mongoose";
import cloudinary from "../services/cloudinary.js";
import { getPlanById, isFeatureEnabled } from "../services/plan.service.js";
import { sanitizeRuleData } from "../utils/businessRuleData.js";
import { normalizeBusinessUserRoles } from "../utils/accessConfig.js";

function resolveBusinessId(req, requestedBusinessId) {
  if (req.user?.role === "developer") {
    if (requestedBusinessId && mongoose.Types.ObjectId.isValid(requestedBusinessId)) {
      return requestedBusinessId;
    }
    return null;
  }
  return req.business?._id || req.user?.businessId || null;
}

function isValidBannerPayload(value) {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  if (value.startsWith("https://") || value.startsWith("http://")) return true;
  if (!value.startsWith("data:image/")) return false;
  if (!value.includes(";base64,")) return false;
  return value.length <= 8_000_000;
}

function sanitizeMachineOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  const seen = new Set();
  return rawOptions
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

function sanitizeStringList(rawOptions, max = 50) {
  if (!Array.isArray(rawOptions)) return [];
  const seen = new Set();
  return rawOptions
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function sanitizeReferenceData(raw = {}) {
  return {
    attendance_options: sanitizeStringList(raw?.attendance_options),
    staff_categories: sanitizeStringList(raw?.staff_categories),
    user_roles: normalizeBusinessUserRoles(sanitizeStringList(raw?.user_roles)),
    customer_payment_methods: sanitizeStringList(raw?.customer_payment_methods),
    supplier_payment_methods: sanitizeStringList(raw?.supplier_payment_methods),
    staff_payment_types: sanitizeStringList(raw?.staff_payment_types),
    expense_types: sanitizeStringList(raw?.expense_types),
    order_units: sanitizeStringList(raw?.order_units),
    crp_categories: sanitizeStringList(raw?.crp_categories),
    bank_suggestions: sanitizeStringList(raw?.bank_suggestions),
    party_suggestions: sanitizeStringList(raw?.party_suggestions),
  };
}

function syncReferenceDataWithRuleData(referenceData = {}, ruleData = {}) {
  const nextReferenceData = {
    ...referenceData,
    attendance_options: (ruleData.attendance_rules || []).map((rule) => rule.label).filter(Boolean),
    customer_payment_methods: (ruleData.customer_payment_method_rules || []).map((rule) => rule.method).filter(Boolean),
    staff_payment_types: (ruleData.staff_payment_type_rules || []).map((rule) => rule.type).filter(Boolean),
    expense_types: (ruleData.expense_type_rules || []).map((rule) => rule.key).filter(Boolean),
  };
  return sanitizeReferenceData(nextReferenceData);
}

// CREATE Business
export const createBusiness = async (req, res) => {
  try {
    const { name, username, password, person, price, registration_date } = req.body;

    const business = await Business.create({ name, person, price, registration_date });
    const user = await User.create({ name, username, password, role: 'admin', businessId: business._id });
    const plan = await getPlanById("trial");
    const subscription = await Subscription.create({
      businessId: business._id,
      plan: plan?.id || "trial",
      status: "trial",
      active: true,
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + Number(plan?.durationDays || 7) * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ business, user, subscription });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create business" });
  }
};

// GET all businesses with pagination and filters
export const getBusinesses = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status } = req.query;
    
    const filter = {};
    
    // Name search filter
    if (name && name.trim()) {
      filter.name = { $regex: name.trim(), $options: 'i' };
    }
    
    // Status filter
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count for pagination
    const total = await Business.countDocuments(filter);
    
    // Fetch paginated data
    const businesses = await Business.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      data: businesses,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch businesses" });
  }
};

export const getBusinessesStats = async (req, res) => {
  try {
    const [total, active, inactive] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ isActive: true }),
      Business.countDocuments({ isActive: false }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        active,
        inactive,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch stats" 
    });
  }
};

// GET single business details
export const getBusiness = async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: "Business not found" });

    if (req.user.role !== "developer" && String(req.user.businessId) !== String(business._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(business);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch business" });
  }
};

// UPDATE business
export const updateBusiness = async (req, res) => {
  try {
    const { name, person, price, registration_date } = req.body;

    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: "Business not found" });

    if (req.user.role !== "developer" && String(req.user.businessId) !== String(business._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    business.name = name ?? business.name;
    business.person = person ?? business.person;
    business.price = price ?? business.price;
    business.registration_date = registration_date ?? business.registration_date;

    await business.save();
    res.json(business);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update business" });
  }
};

// TOGGLE Active / Inactive
export const toggleBusinessStatus = async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: "Business not found" });

    if (req.user.role !== "developer" && String(req.user.businessId) !== String(business._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    business.isActive = !business.isActive;
    await business.save();

    res.json({ id: business._id, isActive: business.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};

export const getMyInvoiceBanner = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const business = await Business.findById(businessId).select("invoice_banner_data");
    if (!business) return res.status(404).json({ message: "Business not found" });

    return res.json({ invoice_banner_data: business.invoice_banner_data || "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch invoice banner" });
  }
};

export const updateMyInvoiceBanner = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.body?.businessId || req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    if (req.user?.role !== "developer") {
      const planId = req.subscription?.plan || "trial";
      if (!(await isFeatureEnabled(planId, "invoice_banner"))) {
        return res.status(402).json({ message: "Premium plan required for invoice banner" });
      }
    }

    const bannerData = req.body?.invoice_banner_data;
    if (!isValidBannerPayload(bannerData)) {
      return res.status(400).json({ message: "Invalid banner image (max ~6MB)" });
    }

    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    if (!bannerData) {
      if (business.invoice_banner_public_id) {
        await cloudinary.uploader.destroy(business.invoice_banner_public_id, {
          resource_type: "image",
        });
      }

      business.invoice_banner_data = "";
      business.invoice_banner_public_id = "";
      await business.save();

      return res.json({ invoice_banner_data: "" });
    }

    if (bannerData.startsWith("data:image/")) {
      const uploaded = await cloudinary.uploader.upload(bannerData, {
        folder: "embroideryos/invoice-banners",
        resource_type: "image",
      });

      if (business.invoice_banner_public_id) {
        await cloudinary.uploader.destroy(business.invoice_banner_public_id, {
          resource_type: "image",
        });
      }

      business.invoice_banner_data = uploaded.secure_url || "";
      business.invoice_banner_public_id = uploaded.public_id || "";
    } else {
      business.invoice_banner_data = bannerData;
    }

    await business.save();

    return res.json({ invoice_banner_data: business.invoice_banner_data || "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update invoice banner" });
  }
};

export const getMyMachineOptions = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const business = await Business.findById(businessId).select("machine_options");
    if (!business) return res.status(404).json({ message: "Business not found" });

    return res.json({
      machine_options: sanitizeMachineOptions(business.machine_options),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch machine options" });
  }
};

export const updateMyMachineOptions = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.body?.businessId || req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const machineOptions = sanitizeMachineOptions(req.body?.machine_options);

    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    business.machine_options = machineOptions;
    await business.save();

    return res.json({ machine_options: business.machine_options });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update machine options" });
  }
};

export const getMyReferenceData = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const business = await Business.findById(businessId).select("reference_data");
    if (!business) return res.status(404).json({ message: "Business not found" });

    return res.json({
      reference_data: sanitizeReferenceData(business.reference_data || {}),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch reference data" });
  }
};

export const updateMyReferenceData = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.body?.businessId || req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    business.reference_data = sanitizeReferenceData(req.body?.reference_data || {});
    await business.save();

    return res.json({
      reference_data: sanitizeReferenceData(business.reference_data || {}),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update reference data" });
  }
};

export const getMyRuleData = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const business = await Business.findById(businessId).select("reference_data rule_data");
    if (!business) return res.status(404).json({ message: "Business not found" });

    return res.json({
      rule_data: sanitizeRuleData(business.rule_data || {}, sanitizeReferenceData(business.reference_data || {})),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch rule data" });
  }
};

export const updateMyRuleData = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.body?.businessId || req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    const nextRuleData = sanitizeRuleData(req.body?.rule_data || {}, sanitizeReferenceData(business.reference_data || {}));
    const nextReferenceData = syncReferenceDataWithRuleData(sanitizeReferenceData(business.reference_data || {}), nextRuleData);

    business.rule_data = nextRuleData;
    business.reference_data = nextReferenceData;
    await business.save();

    return res.json({
      rule_data: sanitizeRuleData(business.rule_data || {}, nextReferenceData),
      reference_data: nextReferenceData,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update rule data" });
  }
};

export const getMyInvoiceCounter = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const businessObjectId = new mongoose.Types.ObjectId(businessId);
    const year = Number(req.query?.year) || new Date().getFullYear();
    const [invoiceCount, counter] = await Promise.all([
      Invoice.countDocuments({ businessId: businessObjectId }),
      InvoiceCounter.findOne({ businessId: businessObjectId, year }).lean(),
    ]);

    const lastInvoiceNo = Number(counter?.seq || 0);
    const canUpdate = invoiceCount === 0;

    return res.json({
      year,
      last_invoice_no: lastInvoiceNo,
      next_invoice_no: lastInvoiceNo + 1,
      can_update: canUpdate,
      has_invoices: invoiceCount > 0,
      invoice_count: invoiceCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch invoice counter" });
  }
};

export const updateMyInvoiceCounter = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req, req.body?.businessId || req.query.businessId);
    if (!businessId) return res.status(400).json({ message: "Business ID is required" });

    const year = Number(req.body?.year) || new Date().getFullYear();
    const parsedLastInvoiceNo = Number(req.body?.last_invoice_no);
    if (!Number.isInteger(parsedLastInvoiceNo) || parsedLastInvoiceNo < 0) {
      return res.status(400).json({ message: "last_invoice_no must be a non-negative integer" });
    }

    const businessObjectId = new mongoose.Types.ObjectId(businessId);
    const invoiceCount = await Invoice.countDocuments({ businessId: businessObjectId });
    if (invoiceCount > 0) {
      return res.status(409).json({
        message: "Cannot change invoice counter after invoice creation",
        code: "INVOICE_COUNTER_LOCKED",
      });
    }

    await InvoiceCounter.findOneAndUpdate(
      { businessId: businessObjectId, year },
      {
        $setOnInsert: { businessId: businessObjectId, year },
        $set: { seq: parsedLastInvoiceNo },
      },
      { upsert: true, new: true }
    );

    return res.json({
      year,
      last_invoice_no: parsedLastInvoiceNo,
      next_invoice_no: parsedLastInvoiceNo + 1,
      can_update: true,
      has_invoices: false,
      invoice_count: 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update invoice counter" });
  }
};
