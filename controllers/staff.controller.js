import mongoose from "mongoose";
import Staff from "../models/Staff.js";

const parseOpeningBalance = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const resolveBusinessId = (req) => {
  if (req.user?.role !== "developer") {
    return req.user?.businessId || null;
  }
  return req.query?.businessId || req.body?.businessId || null;
};

const buildBusinessFilter = (req, allowEmptyForDeveloper = true) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) {
    return allowEmptyForDeveloper && req.user?.role === "developer" ? {} : null;
  }
  if (!mongoose.Types.ObjectId.isValid(businessId)) return null;
  return { businessId: new mongoose.Types.ObjectId(businessId) };
};

// CREATE Staff
export const createStaff = async (req, res) => {
  try {
    const { name, joining_date, salary, opening_balance } = req.body;
    const businessFilter = buildBusinessFilter(req, false);
    if (!businessFilter) {
      return res.status(400).json({ message: "Valid businessId is required" });
    }

    const staff = await Staff.create({
      name,
      joining_date,
      salary,
      opening_balance: parseOpeningBalance(opening_balance),
      businessId: businessFilter.businessId,
    });

    res.status(201).json({ staff });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create staff" });
  }
};

// GET all staffs with pagination and filters
export const getStaffs = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status } = req.query;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    const filter = { ...businessFilter };

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
    const total = await Staff.countDocuments(filter);
    
    // Fetch paginated data
    const staffs = await Staff.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      data: staffs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch staffs" });
  }
};

// GET all staff namess with pagination and filters
export const getStaffNames = async (req, res) => {
  try {
    const { status } = req.query;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const filter = { ...businessFilter };
    
    // Status filter
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    // Fetch paginated data
    const staffs = await Staff.find(filter)
      .sort({ name: 1 })
      .select('name joining_date'); // Only select the name and joining_date fields
    
    res.json({
      data: staffs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch staffs" });
  }
};

export const getStaffsStats = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ success: false, message: "Invalid businessId" });
    }

    const [total, active, inactive] = await Promise.all([
      Staff.countDocuments(businessFilter),
      Staff.countDocuments({ ...businessFilter, isActive: true }),
      Staff.countDocuments({ ...businessFilter, isActive: false }),
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

// GET single staff details
export const getStaff = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const staff = await Staff.findOne({ _id: req.params.id, ...businessFilter });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch staff" });
  }
};

// UPDATE staff
export const updateStaff = async (req, res) => {
  try {
    const { joining_date, salary, opening_balance } = req.body;
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const staff = await Staff.findOne({ _id: req.params.id, ...businessFilter });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    staff.joining_date = joining_date ?? staff.joining_date;
    staff.salary = salary ?? staff.salary;
    if (opening_balance !== undefined) {
      staff.opening_balance = parseOpeningBalance(opening_balance);
    }

    await staff.save();
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update staff" });
  }
};

// TOGGLE Active / Inactive
export const toggleStaffStatus = async (req, res) => {
  try {
    const businessFilter = buildBusinessFilter(req);
    if (!businessFilter) {
      return res.status(400).json({ message: "Invalid businessId" });
    }

    const staff = await Staff.findOne({ _id: req.params.id, ...businessFilter });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    staff.isActive = !staff.isActive;
    await staff.save();

    res.json({ id: staff._id, isActive: staff.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};
