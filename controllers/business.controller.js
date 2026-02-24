// controllers/business.controller.js
import Business from "../models/Business.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import mongoose from "mongoose";

function resolveBusinessId(req, requestedBusinessId) {
  if (req.user?.role === "developer") {
    if (requestedBusinessId && mongoose.Types.ObjectId.isValid(requestedBusinessId)) {
      return requestedBusinessId;
    }
    return null;
  }
  return req.business?._id || req.user?.businessId || null;
}

function isValidBannerData(value) {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  if (!value.startsWith("data:image/")) return false;
  if (!value.includes(";base64,")) return false;
  return value.length <= 8_000_000;
}

// CREATE Business
export const createBusiness = async (req, res) => {
  try {
    const { name, username, password, person, price, registration_date } = req.body;

    const business = await Business.create({ name, person, price, registration_date });
    const user = await User.create({ name, username, password, role: 'admin', businessId: business._id });
    const subscription = await Subscription.create({ businessId: business._id });

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

    if (req.user.role !== "developer" && business.createdBy.toString() !== req.user._id.toString()) {
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

    if (req.user.role !== "developer" && business.createdBy.toString() !== req.user._id.toString()) {
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

    if (req.user.role !== "developer" && business.createdBy.toString() !== req.user._id.toString()) {
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

    const bannerData = req.body?.invoice_banner_data;
    if (!isValidBannerData(bannerData)) {
      return res.status(400).json({ message: "Invalid banner image (max ~6MB)" });
    }

    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    business.invoice_banner_data = bannerData || "";
    await business.save();

    return res.json({ invoice_banner_data: business.invoice_banner_data || "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update invoice banner" });
  }
};
