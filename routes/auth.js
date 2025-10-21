import express from "express";
import bcrypt from "bcryptjs";
import { generateToken, verifyToken } from "../utils/authUtils.js";
import pool from "../utils/db.js";

const router = express.Router();

// Register
router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: "All fields are required" });

  pool.query("SELECT * FROM users WHERE email = $1", [email], (err, existing) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (existing.rows.length > 0)
      return res.status(400).json({ error: "User already exists" });

    bcrypt.hash(password, 10, (err, hashed) => {
      if (err) return res.status(500).json({ error: "Error hashing password" });

      pool.query(
        "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, role",
        [name, email, hashed],
        (err, result) => {
          if (err) {
            console.error("DB insert error:", err);
            return res.status(500).json({ error: "Error creating user" });
          }

          const user = result.rows[0];
          const token = generateToken({
            id: user.id,
            email: user.email,
            role: user.role || "user",
          });
          res.json({ token, user });
        }
      );
    });
  });
});

// Login
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  pool.query("SELECT * FROM users WHERE email = $1", [email], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (result.rows.length === 0)
      return res.status(400).json({ error: "User not found" });

    const user = result.rows[0];
    bcrypt.compare(password, user.password, (err, valid) => {
      if (err) return res.status(500).json({ error: "Error checking password" });
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      res.json({ token, user });
    });
  });
});

// Verify Token
router.get("/verify", verifyToken, (req, res) => {
  // If verifyToken middleware passes, return user data
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  });
});

export default router;