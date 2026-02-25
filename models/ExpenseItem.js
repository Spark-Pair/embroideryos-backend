import mongoose from "mongoose";

const expenseItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    expense_type: {
      type: String,
      enum: ["cash", "supplier", "fixed"],
      required: true,
      index: true,
    },
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
