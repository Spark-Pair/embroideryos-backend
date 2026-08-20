import express from "express";
import {
  createInvoice,
  getInvoice,
  getInvoiceOrderGroups,
  getInvoices,
  updateInvoice,
} from "../controllers/invoice.controller.js";

const router = express.Router();

router.get("/order-groups", getInvoiceOrderGroups);
router.get("/", getInvoices);
router.get("/:id", getInvoice);
router.post("/", createInvoice);
router.put("/:id", updateInvoice);

export default router;