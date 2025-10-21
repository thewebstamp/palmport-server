import express from "express";
import db from "../utils/db.js";
import { verifyAdmin, verifyToken } from "../utils/authUtils.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Dashboard data
router.get("/dashboard", verifyAdmin, async (req, res) => {
  try {
    // Get total orders
    const totalOrders = await new Promise((resolve, reject) => {
      db.query("SELECT COUNT(*) as count FROM orders", [], (err, result) => {
        if (err) reject(err);
        else resolve(parseInt(result.rows[0].count));
      });
    });

    // Get pending orders
    const pendingOrders = await new Promise((resolve, reject) => {
      db.query("SELECT COUNT(*) as count FROM orders WHERE delivery_status = 'pending'", [], (err, result) => {
        if (err) reject(err);
        else resolve(parseInt(result.rows[0].count));
      });
    });

    // Get total batches
    const totalBatches = await new Promise((resolve, reject) => {
      db.query("SELECT COUNT(*) as count FROM batches", [], (err, result) => {
        if (err) reject(err);
        else resolve(parseInt(result.rows[0].count));
      });
    });

    // Get total subscribers
    const totalSubscribers = await new Promise((resolve, reject) => {
      db.query("SELECT COUNT(*) as count FROM subscribers", [], (err, result) => {
        if (err) reject(err);
        else resolve(parseInt(result.rows[0].count));
      });
    });

    // Get recent orders
    const recentOrders = await new Promise((resolve, reject) => {
      db.query(`
        SELECT * FROM orders 
        ORDER BY created_at DESC 
        LIMIT 5
      `, [], (err, result) => {
        if (err) reject(err);
        else resolve(result.rows);
      });
    });

    res.json({
      totalOrders,
      pendingOrders,
      totalBatches,
      totalSubscribers,
      recentOrders
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Get all orders with pagination
router.get("/orders", verifyAdmin, (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM orders 
    ORDER BY created_at DESC 
    LIMIT $1 OFFSET $2
  `;
  
  db.query(query, [limit, offset], (err, result) => {
    if (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result.rows);
  });
});

// Verify token route
router.get("/verify", verifyToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json({ valid: true, user: req.user });
});

// Update order status
router.put("/orders/:id/status", verifyAdmin, (req, res) => {
  const { id } = req.params;
  const { delivery_status } = req.body;

  db.query(
    "UPDATE orders SET delivery_status = $1 WHERE id = $2 RETURNING *",
    [delivery_status, id],
    (err, result) => {
      if (err) {
        console.error("Error updating order:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(result.rows[0]);
    }
  );
});

// Admin Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Check if credentials match the environment variables
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      // Generate JWT token
      const token = jwt.sign(
        { 
          email: email, 
          role: "admin",
          id: "admin"
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,
        user: {
          email: email,
          role: "admin",
          name: "Administrator"
        },
        message: "Login successful"
      });
    } else {
      return res.status(401).json({ error: "Invalid email or password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;