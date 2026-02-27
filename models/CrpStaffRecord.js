import mongoose from "mongoose";

const crpStaffRecordSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    order_date: { type: Date, required: true, index: true },
    order_description: { type: String, default: "", trim: true },
    quantity_dzn: { type: Number, required: true, min: 0 },

    staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    staff_name: { type: String, required: true, trim: true },

    category: {
      type: String,
      enum: ["Press", "Cropping", "Other"],
      required: true,
      index: true,
    },
    type_name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    total_amount: { type: Number, required: true, min: 0 },

    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
      index: true,
    },

    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

crpStaffRecordSchema.index({ businessId: 1, order_date: -1, createdAt: -1 });

export default mongoose.model("CrpStaffRecord", crpStaffRecordSchema);
