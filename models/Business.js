import mongoose from "mongoose";

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  person: { type: String, required: true },
  price: { type: Number, required: true },
  registration_date: { type: Date, default: Date.now },
  invoice_banner_data: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("Business", businessSchema);
