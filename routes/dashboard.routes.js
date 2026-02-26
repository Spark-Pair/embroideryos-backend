import express from "express";
import { getDashboardSummary, getDashboardTrend } from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/summary", getDashboardSummary);
router.get("/trend", getDashboardTrend);

export default router;
