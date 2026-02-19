import Staff from "../models/Staff.js";

// CREATE Staff
export const createStaff = async (req, res) => {
  try {
    const { name, joining_date, salary } = req.body;

    const staff = await Staff.create({ name, joining_date, salary });

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

export const getStaffsStats = async (req, res) => {
  try {
    const [total, active, inactive] = await Promise.all([
      Staff.countDocuments(),
      Staff.countDocuments({ isActive: true }),
      Staff.countDocuments({ isActive: false }),
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
    const staff = await Staff.findById(req.params.id);
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
    const { joining_date, salary } = req.body;

    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    staff.joining_date = joining_date ?? staff.joining_date;
    staff.salary = salary ?? staff.salary;

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
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    staff.isActive = !staff.isActive;
    await staff.save();

    res.json({ id: staff._id, isActive: staff.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};