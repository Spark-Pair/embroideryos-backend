import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customer_name: { type: String, required: true, trim: true },
    customer_person: { type: String, default: "", trim: true },
    order_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
      },
    ],
    order_count: { type: Number, default: 0, min: 0 },
    total_amount: { type: Number, default: 0, min: 0 },
    invoice_date: { type: Date, required: true, index: true },
    image_data: { type: String, default: "" },
    note: { type: String, default: "", trim: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ businessId: 1, invoice_date: -1, createdAt: -1 });

export default mongoose.model("Invoice", invoiceSchema);
