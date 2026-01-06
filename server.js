import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';

connectDB();

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
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
import customerRoutes from './routes/customer.routes.js';
import businessRoutes from './routes/business.routes.js';
import userRoutes from './routes/user.routes.js';

app.use('/api/auth', authRoutes); // login, logout, register

app.use('/api/customers', authMiddleware, subscriptionMiddleware, allowedRoles(['admin', 'staff']), customerRoutes);
app.use('/api/business', authMiddleware, businessRoutes);
app.use('/api/user', authMiddleware, allowedRoles(['developer']), userRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
