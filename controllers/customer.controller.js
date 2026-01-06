export const addCustomer = async (req, res) => {
  try {
    const { name, person, rate, isActive } = req.body;

    const newCustomer = new Customer({
      name,
      person,
      rate,
      isActive,
    });

    const saved = await newCustomer.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: "Failed to create customer" });
  }
};

// 📌 Update Customer
export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    customer.name = req.body.name ?? customer.name;
    customer.person = req.body.person ?? customer.person;
    customer.rate = req.body.rate ?? customer.rate;
    customer.isActive = req.body.isActive ?? customer.isActive;

    const updated = await customer.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update customer" });
  }
};