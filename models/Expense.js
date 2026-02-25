import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    expense_type: {
      type: String,
      enum: ["cash", "supplier", "fixed"],
      default: "cash",
      index: true,
    },
    item_name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    month: {
      type: String,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
    },
    reference_no: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true },
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
    supplier_name: { type: String, default: "", trim: true },
    group_key: { type: String, default: "", index: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ businessId: 1, date: -1, createdAt: -1 });

export default mongoose.model("Expense", expenseSchema);
