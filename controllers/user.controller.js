// controllers/user.controller.js
import User from "../models/User.js";

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

// GET single user details
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role !== "developer" && user.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

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

    if (req.user.role !== "developer" && user.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

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