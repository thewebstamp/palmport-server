// server/routes/cart.js
import express from "express";
import { verifyUser } from "../utils/authUtils.js";
import db from "../utils/db.js";

const router = express.Router();

// Get cart items
router.get("/", verifyUser, (req, res) => {
  const userId = req.user.id;
  
  db.query(
    "SELECT * FROM cart_items WHERE user_id = $1",
    [userId],
    (err, result) => {
      if (err) {
        console.error("Error fetching cart:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(result.rows);
    }
  );
});

// Add to cart
router.post("/add", verifyUser, (req, res) => {
  const userId = req.user.id;
  const { productId, quantity } = req.body;

  // Check if item already in cart
  db.query(
    "SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2",
    [userId, productId],
    (err, result) => {
      if (err) {
        console.error("Error checking cart:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.rows.length > 0) {
        // Update quantity
        db.query(
          "UPDATE cart_items SET quantity = quantity + $1 WHERE user_id = $2 AND product_id = $3",
          [quantity, userId, productId],
          (err, result) => {
            if (err) {
              console.error("Error updating cart:", err);
              return res.status(500).json({ error: "Database error" });
            }
            res.json({ message: "Cart updated successfully" });
          }
        );
      } else {
        // Insert new item
        db.query(
          "INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)",
          [userId, productId, quantity],
          (err, result) => {
            if (err) {
              console.error("Error adding to cart:", err);
              return res.status(500).json({ error: "Database error" });
            }
            res.json({ message: "Item added to cart" });
          }
        );
      }
    }
  );
});

// Remove from cart
router.delete("/remove/:productId", verifyUser, (req, res) => {
  const userId = req.user.id;
  const { productId } = req.params;

  db.query(
    "DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2",
    [userId, productId],
    (err, result) => {
      if (err) {
        console.error("Error removing from cart:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ message: "Item removed from cart" });
    }
  );
});

export default router;