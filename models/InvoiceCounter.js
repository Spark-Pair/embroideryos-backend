import mongoose from "mongoose";

const invoiceCounterSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    year: { type: Number, required: true, index: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

invoiceCounterSchema.index({ businessId: 1, year: 1 }, { unique: true });

export default mongoose.model("InvoiceCounter", invoiceCounterSchema);
