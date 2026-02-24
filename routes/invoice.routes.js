import express from "express";
import {
  createInvoice,
  getInvoice,
  getInvoiceOrderGroups,
  getInvoices,
} from "../controllers/invoice.controller.js";

const router = express.Router();

router.get("/order-groups", getInvoiceOrderGroups);
router.get("/", getInvoices);
router.get("/:id", getInvoice);
router.post("/", createInvoice);

export default router;
