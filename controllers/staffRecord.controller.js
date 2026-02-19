import StaffRecord from "../models/StaffRecord.js";

// CREATE StaffRecord
export const createStaffRecord = async (req, res) => {
  try {
    const { name, joining_date, salary } = req.body;

    const StaffRecord = await StaffRecord.create({ name, joining_date, salary });

    res.status(201).json({ StaffRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create StaffRecord" });
  }
};

// GET all StaffRecords with pagination and filters
export const getStaffRecords = async (req, res) => {
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
    const total = await StaffRecord.countDocuments(filter);
    
    // Fetch paginated data
    const StaffRecords = await StaffRecord.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      data: StaffRecords,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch StaffRecords" });
  }
};

export const getStaffRecordsStats = async (req, res) => {
  try {
    const [total, active, inactive] = await Promise.all([
      StaffRecord.countDocuments(),
      StaffRecord.countDocuments({ isActive: true }),
      StaffRecord.countDocuments({ isActive: false }),
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

// GET single StaffRecord details
export const getStaffRecord = async (req, res) => {
  try {
    const StaffRecord = await StaffRecord.findById(req.params.id);
    if (!StaffRecord) return res.status(404).json({ message: "StaffRecord not found" });

    res.json(StaffRecord);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch StaffRecord" });
  }
};

// UPDATE StaffRecord
export const updateStaffRecord = async (req, res) => {
  try {
    const { joining_date, salary } = req.body;

    const StaffRecord = await StaffRecord.findById(req.params.id);
    if (!StaffRecord) return res.status(404).json({ message: "StaffRecord not found" });

    StaffRecord.joining_date = joining_date ?? StaffRecord.joining_date;
    StaffRecord.salary = salary ?? StaffRecord.salary;

    await StaffRecord.save();
    res.json(StaffRecord);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update StaffRecord" });
  }
};

// TOGGLE Active / Inactive
export const toggleStaffRecordStatus = async (req, res) => {
  try {
    const StaffRecord = await StaffRecord.findById(req.params.id);
    if (!StaffRecord) return res.status(404).json({ message: "StaffRecord not found" });

    StaffRecord.isActive = !StaffRecord.isActive;
    await StaffRecord.save();

    res.json({ id: StaffRecord._id, isActive: StaffRecord.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};