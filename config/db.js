// config/db.js
import mongoose from 'mongoose';
import User from '../models/User.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // ✅ Check for default admin
    const defaultUsername = 'sparkpair';
    const defaultUser = await User.findOne({ username: defaultUsername });

    if (!defaultUser) {
      const adminUser = new User({
        name: 'SparkPair',
        username: defaultUsername,
        password: 'sparkpair',
        role: 'developer',
        businessId: null
      });
      await adminUser.save();
      console.log('Default admin user created: sparkpair / sparkpair');
    } else {
      console.log('Default admin user already exists');
    }

  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
