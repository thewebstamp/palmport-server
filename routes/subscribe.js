import express from "express";
import pool from "../utils/db.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { verifyAdmin } from "../utils/authUtils.js";

dotenv.config();

const router = express.Router();

// 📧 Setup Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 📨 Subscribe
router.post("/", (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  // Ensure table exists
  pool.query(
    `CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    (err) => {
      if (err) {
        console.error("Error creating table:", err);
        return res.status(500).json({ error: "Database error" });
      }

      // Insert subscriber
      pool.query(
        `INSERT INTO subscribers (email) VALUES ($1) 
         ON CONFLICT (email) DO NOTHING RETURNING *`,
        [email],
        (err, result) => {
          if (err) {
            console.error("Insert error:", err);
            return res.status(500).json({ error: "Database error" });
          }

          // If no new subscriber, skip email sending
          if (result.rowCount === 0) {
            return res.status(200).json({
              success: true,
              message: "Already subscribed.",
            });
          }

          // Send confirmation and admin alert
          const confirmationEmail = {
            from: `"PalmPort Updates" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Welcome to PalmPort Updates 🌴",
            html: `
              <div style="font-family: 'Segoe UI', sans-serif; padding: 20px; background-color: #f9f6f2;">
                <h2 style="color: #D84727;">Thank you for subscribing!</h2>
                <p>We'll keep you updated on fresh palm oil batches, traceability, and PalmPort news.</p>
              </div>
            `,
          };

          const adminEmail = {
            from: `"PalmPort Notifications" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `New Subscriber: ${email}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h3>New Subscription</h3>
                <p><strong>Email:</strong> ${email}</p>
              </div>
            `,
          };

          transporter.sendMail(confirmationEmail, (err) => {
            if (err) console.error("Error sending confirmation:", err);
          });

          transporter.sendMail(adminEmail, (err) => {
            if (err) console.error("Error sending admin notification:", err);
          });

          res.status(200).json({
            success: true,
            message: "Subscribed successfully. Confirmation email sent.",
          });
        }
      );
    }
  );
});

// 👁️ View Subscribers (Admin only)
router.get("/", verifyAdmin, (req, res) => {
  pool.query("SELECT * FROM subscribers ORDER BY created_at DESC", (err, result) => {
    if (err) {
      console.error("Error fetching subscribers:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.status(200).json(result.rows);
  });
});

// 💌 Mass Email (Admin only)
router.post("/send", verifyAdmin, (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message)
    return res.status(400).json({ error: "Subject and message are required" });

  pool.query("SELECT email FROM subscribers", (err, result) => {
    if (err) {
      console.error("Error fetching subscribers:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const subscribers = result.rows.map((r) => r.email);
    if (subscribers.length === 0)
      return res.status(400).json({ error: "No subscribers to email." });

    subscribers.forEach((email) => {
      transporter.sendMail(
        {
          from: `"PalmPort Updates" <${process.env.EMAIL_USER}>`,
          to: email,
          subject,
          html: `
            <div style="font-family: 'Segoe UI', sans-serif; padding: 20px; background-color: #fff8f3;">
              ${message}
              <hr style="margin-top:20px;" />
              <p style="font-size:12px; color:#666;">You received this from PalmPort.</p>
            </div>
          `,
        },
        (err) => {
          if (err) console.error(`Error emailing ${email}:`, err);
        }
      );
    });

    res.status(200).json({
      success: true,
      message: `Mass email sent to ${subscribers.length} subscribers.`,
    });
  });
});

// 🗑️ Delete Subscriber (Admin only)
router.delete("/:id", verifyAdmin, (req, res) => {
  const { id } = req.params;

  pool.query("DELETE FROM subscribers WHERE id = $1", [id], (err, result) => {
    if (err) {
      console.error("Error deleting subscriber:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Subscriber not found" });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "Subscriber deleted successfully" 
    });
  });
});

export default router;