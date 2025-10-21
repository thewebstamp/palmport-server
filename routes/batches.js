import express from "express";
import db from "../utils/db.js";
import QRCode from "qrcode";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { verifyAdmin } from "../utils/authUtils.js";

const router = express.Router();

// GET all batches with product info
router.get("/", (req, res) => {
  const query = `
    SELECT b.*, p.name as product_name, p.size as product_size 
    FROM batches b 
    LEFT JOIN products p ON b.product_id = p.id 
    ORDER BY b.created_at DESC
  `;
  
  db.query(query, [], (err, result) => {
    if (err) {
      console.error("Error fetching batches:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result.rows);
  });
});

// POST create new batch
router.post("/", verifyAdmin, async (req, res) => {
  try {
    const { batch_id, title, state, manufacturer, quality, notes, manufacture_date, product_id, imageBase64 } = req.body;

    // Upload image to Cloudinary
    const imageUrl = imageBase64 ? await uploadToCloudinary(imageBase64) : null;

    // Generate QR Code
    const batchUrl = `${process.env.CLIENT_URL}/trace/${batch_id}`;
    const qrCodeUrl = await QRCode.toDataURL(batchUrl);

    const query = `
      INSERT INTO batches 
      (batch_id, title, state, manufacturer, quality, notes, manufacture_date, product_id, qr_code_url, image_url, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *;
    `;
    const values = [batch_id, title, state, manufacturer, quality, notes, manufacture_date, product_id, qrCodeUrl, imageUrl];

    db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error inserting batch:", err);
        return res.status(500).json({ error: "Database insert error" });
      }
      res.status(201).json(result.rows[0]);
    });
  } catch (error) {
    console.error("Error creating batch:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET a single batch by batch_id for traceability
router.get("/:batch_id", (req, res) => {
  const { batch_id } = req.params;

  const query = `
    SELECT b.*, p.name as product_name, p.size as product_size, p.description as product_description
    FROM batches b 
    LEFT JOIN products p ON b.product_id = p.id 
    WHERE b.batch_id = $1
  `;
  
  db.query(query, [batch_id], (err, result) => {
    if (err) {
      console.error("Error fetching batch:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Batch not found" });
    }
    res.json(result.rows[0]);
  });
});

// UPDATE batch
router.put("/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, state, manufacturer, quality, notes, manufacture_date, product_id, imageBase64 } = req.body;

    console.log("UPDATE request received:", { id, body: req.body }); // Add this

    let imageUrl = null;
    if (imageBase64) {
      imageUrl = await uploadToCloudinary(imageBase64);
    }

    const query = `
      UPDATE batches 
      SET title = $1, state = $2, manufacturer = $3, quality = $4, notes = $5, 
          manufacture_date = $6, product_id = $7, image_url = COALESCE($8, image_url)
      WHERE id = $9 
      RETURNING *
    `;
    const values = [title, state, manufacturer, quality, notes, manufacture_date, product_id, imageUrl, id];

    console.log("Executing query with values:", values); // Add this

    db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error updating batch:", err);
        console.error("Database error details:", err.message);
        console.error("SQL State:", err.code); // Add this
        return res.status(500).json({ error: "Database error: " + err.message });
      }
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(result.rows[0]);
    });
  } catch (error) {
    console.error("Error updating batch:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE batch
router.delete("/:id", verifyAdmin, (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM batches WHERE id = $1", [id], (err, result) => {
    if (err) {
      console.error("Error deleting batch:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ message: "Batch deleted successfully" });
  });
});

export default router;