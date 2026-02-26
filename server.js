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

app.use(express.json({ limit: '10mb' }));

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
import supplierRoutes from './routes/supplier.routes.js';
import staffRoutes from './routes/staff.routes.js';
import staffRecordRoutes from './routes/staffRecord.routes.js';
import productionConfigRoutes from './routes/productionConfig.routes.js';
import staffPaymentRoutes from './routes/staffPayment.routes.js';
import supplierPaymentRoutes from './routes/supplierPayment.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import expenseItemRoutes from './routes/expenseItem.routes.js';
import orderRoutes from './routes/order.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import customerPaymentRoutes from './routes/customerPayment.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import subscriptionRoutes from "./routes/subscription.routes.js";

app.use('/api/auth', authRoutes); // login, logout, register

app.use('/api/businesses', authMiddleware, businessRoutes);
app.use('/api/users', authMiddleware, allowedRoles(['developer']), userRoutes);
app.use('/api/customers', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), customerRoutes);
app.use('/api/suppliers', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), supplierRoutes);
app.use('/api/staffs', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), staffRoutes);
app.use('/api/staff-records', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), staffRecordRoutes);
app.use('/api/staff-payments', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), staffPaymentRoutes);
app.use('/api/supplier-payments', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), supplierPaymentRoutes);
app.use('/api/expenses', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), expenseRoutes);
app.use('/api/expense-items', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), expenseItemRoutes);
app.use('/api/production-configs', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), productionConfigRoutes);
app.use('/api/orders', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), orderRoutes);
app.use('/api/invoices', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), invoiceRoutes);
app.use('/api/customer-payments', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), customerPaymentRoutes);
app.use('/api/dashboard', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), dashboardRoutes);
app.use("/api/subscriptions", authMiddleware, subscriptionRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
