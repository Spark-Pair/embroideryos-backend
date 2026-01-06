// models/Subscription.js
import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
  plan: { type: String, default: 'trial' },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7*24*60*60*1000) }, // 7 days trial
}, { timestamps: true });

export default mongoose.model('Subscription', subscriptionSchema);
