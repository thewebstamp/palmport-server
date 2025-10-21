import express from "express";
import db from "../utils/db.js";
import { verifyAdmin, verifyToken } from "../utils/authUtils.js";

const router = express.Router();

// GET shipping settings (public)
router.get("/settings", (req, res) => {
  db.query("SELECT * FROM shipping_settings WHERE id = 1", [], (err, result) => {
    if (err) {
      console.error("Error fetching shipping settings:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    // Return default values if no settings found
    const settings = result.rows[0] || { 
      shipping_fee: 1000, 
      free_shipping_threshold: 5000 
    };
    
    res.json(settings);
  });
});

// UPDATE shipping settings (Admin only)
router.put("/settings", verifyAdmin, (req, res) => {
  const { shipping_fee, free_shipping_threshold } = req.body;

  if (!shipping_fee || !free_shipping_threshold) {
    return res.status(400).json({ error: "Shipping fee and free shipping threshold are required" });
  }

  const query = `
    INSERT INTO shipping_settings (id, shipping_fee, free_shipping_threshold, updated_at)
    VALUES (1, $1, $2, NOW())
    ON CONFLICT (id) 
    DO UPDATE SET 
      shipping_fee = EXCLUDED.shipping_fee,
      free_shipping_threshold = EXCLUDED.free_shipping_threshold,
      updated_at = NOW()
    RETURNING *
  `;

  db.query(query, [shipping_fee, free_shipping_threshold], (err, result) => {
    if (err) {
      console.error("Error updating shipping settings:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ 
      success: true, 
      message: "Shipping settings updated successfully",
      settings: result.rows[0] 
    });
  });
});

// GET current shipping settings for admin
router.get("/admin/settings", verifyAdmin, (req, res) => {
  db.query("SELECT * FROM shipping_settings WHERE id = 1", [], (err, result) => {
    if (err) {
      console.error("Error fetching shipping settings:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    const settings = result.rows[0] || { 
      shipping_fee: 1000, 
      free_shipping_threshold: 5000 
    };
    
    res.json(settings);
  });
});

export default router;