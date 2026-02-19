import express from "express";
import {
  getProductionConfig,
  updateProductionConfig,
} from "../controllers/productionConfig.controller.js";

const router = express.Router();

router.get("/",  getProductionConfig);    // GET  /production-config
router.put("/",  updateProductionConfig); // PUT  /production-config

export default router;