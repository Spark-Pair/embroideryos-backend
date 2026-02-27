import express from "express";
import {
  createCrpStaffRecord,
  deleteCrpStaffRecord,
  getCrpStaffRecords,
  getCrpStaffRecordStats,
} from "../controllers/crpStaffRecord.controller.js";

const router = express.Router();

router.get("/stats", getCrpStaffRecordStats);
router.get("/", getCrpStaffRecords);
router.post("/", createCrpStaffRecord);
router.delete("/:id", deleteCrpStaffRecord);

export default router;
