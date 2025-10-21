import express from "express";
import db from "../utils/db.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { verifyAdmin } from "../utils/authUtils.js";

const router = express.Router();

// GET all products
router.get("/", (req, res) => {
  db.query("SELECT * FROM products ORDER BY created_at DESC", [], (err, result) => {
    if (err) {
      console.error("Error fetching products:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result.rows);
  });
});

// POST create new product
router.post("/", verifyAdmin, async (req, res) => {
  try {
    const { name, description, price, original_price, size, features, in_stock, imageBase64 } = req.body;

    // Upload image if provided
    const imageUrl = imageBase64 ? await uploadToCloudinary(imageBase64) : null;

    const query = `
      INSERT INTO products 
      (name, description, price, original_price, size, features, in_stock, image_url, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *;
    `;
    const values = [name, description, price, original_price, size, features, in_stock, imageUrl];

    db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error inserting product:", err);
        return res.status(500).json({ error: "Database insert error" });
      }
      res.status(201).json(result.rows[0]);
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT update product
router.put("/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, original_price, size, features, in_stock, imageBase64 } = req.body;

    let imageUrl = null;
    if (imageBase64) {
      imageUrl = await uploadToCloudinary(imageBase64);
    }

    const query = `
      UPDATE products 
      SET name = $1, description = $2, price = $3, original_price = $4, 
          size = $5, features = $6, in_stock = $7, 
          image_url = COALESCE($8, image_url)
      WHERE id = $9 
      RETURNING *
    `;
    const values = [name, description, price, original_price, size, features, in_stock, imageUrl, id];

    db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error updating product:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(result.rows[0]);
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE product
router.delete("/:id", verifyAdmin, (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM products WHERE id = $1", [id], (err, result) => {
    if (err) {
      console.error("Error deleting product:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ message: "Product deleted successfully" });
  });
});

export default router;