import Customer from "../models/Customer.js";

// CREATE Customer
export const createCustomer = async (req, res) => {
  try {
    const { name, person, rate, businessId } = req.body;

    const customer = await Customer.create({ name, person, rate, businessId });

    res.status(201).json({ customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create customer" });
  }
};

// GET all customers with pagination and filters
export const getCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 30, name, status, businessId } = req.query;
    
    const filter = {};
    
    // Business ID filter
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      filter.businessId = new mongoose.Types.ObjectId(businessId);
    }
    
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
    const total = await Customer.countDocuments(filter);
    
    // Fetch paginated data
    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      data: customers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch customers" });
  }
};

export const getCustomersStats = async (req, res) => {
  try {
    const [total, active, inactive] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ isActive: true }),
      Customer.countDocuments({ isActive: false }),
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

// GET single customer details
export const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch customer" });
  }
};

// UPDATE customer
export const updateCustomer = async (req, res) => {
  try {
    const { rate } = req.body;

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    customer.rate = rate ?? customer.rate;

    await customer.save();
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update customer" });
  }
};

// TOGGLE Active / Inactive
export const toggleCustomerStatus = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    customer.isActive = !customer.isActive;
    await customer.save();

    res.json({ id: customer._id, isActive: customer.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};