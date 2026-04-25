// controllers/user.controller.js
import User from "../models/User.js";
import Business from "../models/Business.js";
import SessionService from "../services/SessionService.js";
import { normalizeBusinessUserRoles } from "../utils/accessConfig.js";

const normalizeLimit = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

const getPrimaryBusinessUserId = async (businessId) => {
  if (!businessId) return null;
  const primary = await User.findOne({
    businessId,
    role: { $ne: "developer" },
  })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();
  return primary?._id || null;
};

// GET all users with pagination and filters
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status } = req.query;

    const filter = {
      role: { $ne: "developer" }, // ❌ exclude developer
    };

    // Name search
    if (name && name.trim()) {
      filter.name = { $regex: name.trim(), $options: "i" };
    }

    // Status filter
    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const total = await User.countDocuments(filter);

    const users = await User.find(filter)
      .populate("businessId", "name") // ✅ sirf business ka name
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

export const getUsersStats = async (req, res) => {
  try {
    const baseFilter = { role: { $ne: "developer" } };

    const [total, active, inactive] = await Promise.all([
      User.countDocuments(baseFilter),
      User.countDocuments({ ...baseFilter, isActive: true }),
      User.countDocuments({ ...baseFilter, isActive: false }),
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
      message: "Failed to fetch stats",
    });
  }
};

export const getLoggedInUsers = async (req, res) => {
  try {
    const data = await SessionService.getActiveSessionsForDeveloper();

    res.json({
      data,
      stats: {
        totalUsers: data.length,
        totalSessions: data.reduce((sum, item) => sum + Number(item.sessionCount || 0), 0),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch active sessions" });
  }
};

export const logoutUserEverywhere = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("_id name");
    if (!user) return res.status(404).json({ message: "User not found" });

    await SessionService.invalidateAllUserSessions(user._id);

    res.json({
      id: user._id,
      message: `${user.name} logged out from all devices`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to logout user" });
  }
};

// GET business users (admin only)
export const getBusinessUsers = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status } = req.query;
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(400).json({ message: "Business ID missing" });
    }

    const filter = {
      businessId,
      role: { $ne: "developer" },
    };

    if (name && name.trim()) {
      filter.name = { $regex: name.trim(), $options: "i" };
    }

    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(filter);

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const businessName = req.business?.name || "";
    const data = users.map((u) => ({
      ...u,
      business_name: businessName,
    }));

    return res.json({
      data,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch business users" });
  }
};

export const getBusinessUsersStats = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ message: "Business ID missing" });

    const baseFilter = { businessId, role: { $ne: "developer" } };
    const [total, active, inactive] = await Promise.all([
      User.countDocuments(baseFilter),
      User.countDocuments({ ...baseFilter, isActive: true }),
      User.countDocuments({ ...baseFilter, isActive: false }),
    ]);

    res.json({
      success: true,
      data: { total, active, inactive },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch stats",
    });
  }
};

export const createBusinessUser = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ message: "Business ID missing" });

    const planLimit = normalizeLimit(req.plan?.limits?.users, 1);
    const currentCount = await User.countDocuments({
      businessId,
      role: { $ne: "developer" },
    });

    if (planLimit > 0 && currentCount >= planLimit) {
      return res.status(403).json({
        message: "User limit reached for your plan",
        code: "USER_LIMIT_REACHED",
      });
    }

    const { name, username, password, role } = req.body || {};
    if (!name || !username || !password) {
      return res.status(400).json({ message: "Name, username, and password are required" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const business = await Business.findById(businessId).select("reference_data").lean();
    const allowedRoles = normalizeBusinessUserRoles(business?.reference_data?.user_roles || []);
    const normalizedRole = allowedRoles.includes(role) ? role : "staff";

    const user = await User.create({
      name,
      username,
      password,
      role: normalizedRole,
      businessId,
      isActive: true,
    });

    res.status(201).json({ id: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create user" });
  }
};

export const toggleBusinessUserStatus = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ message: "Business ID missing" });

    const user = await User.findOne({
      _id: req.params.id,
      businessId,
      role: { $ne: "developer" },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const planLimit = normalizeLimit(req.plan?.limits?.users, 1);
    const primaryId = await getPrimaryBusinessUserId(businessId);

    if (planLimit <= 1) {
      if (String(user._id) === String(primaryId) && user.isActive) {
        return res.status(403).json({
          message: "Primary user cannot be deactivated on this plan",
          code: "PRIMARY_USER_LOCKED",
        });
      }
      if (String(user._id) !== String(primaryId) && !user.isActive) {
        return res.status(403).json({
          message: "Plan allows only one user",
          code: "USER_LIMIT_REACHED",
        });
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({ id: user._id, isActive: user.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};

export const resetBusinessUserPassword = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ message: "Business ID missing" });

    const user = await User.findOne({
      _id: req.params.id,
      businessId,
      role: { $ne: "developer" },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { newPassword } = req.body || {};
    if (!newPassword) return res.status(400).json({ message: "New password is required" });

    user.password = newPassword;
    await user.save();

    res.json({ id: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to reset password" });
  }
};

// GET single user details
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// TOGGLE Active / Inactive
export const toggleStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isActive = !user.isActive;
    await user.save();

    res.json({ id: user._id, isActive: user.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role !== "developer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { newPassword } = req.body;

    user.password = newPassword;
    await user.save();

    res.json({ id: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};
