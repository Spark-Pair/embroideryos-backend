import express from "express";
import {
  createStaffRecord,
  getStaffRecords,
  getStaffRecord,
  getStaffLastRecord,
  updateStaffRecord,
  deleteStaffRecord,
  getStaffRecordStats,
  getStaffRecordMonths,
} from "../controllers/staffRecord.controller.js";

const router = express.Router();

router.get("/stats",               getStaffRecordStats);   // GET  /staff-records/stats
router.get("/months",              getStaffRecordMonths);  // GET  /staff-records/months
router.get("/last/:staff_id",      getStaffLastRecord);    // GET  /staff-records/last/:staff_id
router.get("/",                    getStaffRecords);        // GET  /staff-records
router.get("/:id",                 getStaffRecord);         // GET  /staff-records/:id
router.post("/",                   createStaffRecord);      // POST /staff-records
router.put("/:id",                 updateStaffRecord);      // PUT  /staff-records/:id
router.delete("/:id",              deleteStaffRecord);      // DELETE /staff-records/:id

export default router;
