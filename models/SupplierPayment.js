import mongoose from "mongoose";

const supplierPaymentSchema = new mongoose.Schema(
  {
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    supplier_name: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
    },
    method: {
      type: String,
      enum: ["cash", "cheque", "online"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reference_no: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

supplierPaymentSchema.index({ businessId: 1, date: -1, createdAt: -1 });

export default mongoose.model("SupplierPayment", supplierPaymentSchema);
