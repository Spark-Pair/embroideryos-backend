import mongoose from "mongoose";

const expenseItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    expense_type: {
      type: String,
      enum: ["general", "cash", "supplier", "fixed"],
      required: true,
      index: true,
    },
    fixed_source: {
      type: String,
      enum: ["", "cash", "supplier"],
      default: "",
      index: true,
    },
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
    supplier_name: { type: String, default: "", trim: true },
    default_quantity: { type: Number, default: 0, min: 0 },
    default_rate: { type: Number, default: 0, min: 0 },
    default_amount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

expenseItemSchema.index({ businessId: 1, expense_type: 1, name: 1 });

export default mongoose.model("ExpenseItem", expenseItemSchema);
