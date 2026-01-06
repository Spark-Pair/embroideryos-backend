import express from 'express';
import authMiddleware from '../middlewares/auth.js';
import subscriptionMiddleware from '../middlewares/subscription.js';
import roleMiddleware from '../middlewares/role.js';
import { addCustomer } from '../controllers/customer.controller.js';

const router = express.Router();

// Common middlewares for all customer routes
router.use(authMiddleware, subscriptionMiddleware);

// GET all customers (admin, staff, customer)
// router.get('/', roleMiddleware(['admin', 'staff']), getCustomers);

// POST new customer (admin only)
router.post('/', roleMiddleware(['admin']), addCustomer);

export default router;