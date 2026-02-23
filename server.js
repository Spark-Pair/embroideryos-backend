import 'dotenv/config';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

dotenv.config();
connectDB();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('EmbroideryOS backend is running');
});

import authMiddleware from './middlewares/auth.js';
import subscriptionMiddleware from './middlewares/subscription.js';
import allowedRoles from './middlewares/role.js';

import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/business.routes.js';
import userRoutes from './routes/user.routes.js';
import customerRoutes from './routes/customer.routes.js';
import staffRoutes from './routes/staff.routes.js';
import staffRecordRoutes from './routes/staffRecord.routes.js';
import productionConfigRoutes from './routes/productionConfig.routes.js';
import staffPaymentRoutes from './routes/staffPayment.routes.js';

app.use('/api/auth', authRoutes); // login, logout, register

app.use('/api/businesses', authMiddleware, businessRoutes);
app.use('/api/users', authMiddleware, allowedRoles(['developer']), userRoutes);
app.use('/api/customers', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), customerRoutes);
app.use('/api/staffs', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), staffRoutes);
app.use('/api/staff-records', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), staffRecordRoutes);
app.use('/api/staff-payments', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), staffPaymentRoutes);
app.use('/api/production-configs', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), productionConfigRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
