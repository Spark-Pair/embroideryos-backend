import express from "express";
import {
  createCrpRateConfig,
  getCrpRateConfigs,
  toggleCrpRateConfigStatus,
  updateCrpRateConfig,
} from "../controllers/crpRateConfig.controller.js";

const router = express.Router();

router.post("/", createCrpRateConfig);
router.get("/", getCrpRateConfigs);
router.put("/:id", updateCrpRateConfig);
router.patch("/:id/toggle-status", toggleCrpRateConfigStatus);

export default router;
