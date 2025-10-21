import express from "express";
import axios from "axios";
import db from "../utils/db.js";
import { verifyToken } from "../utils/authUtils.js";
import { sendOrderNotificationEmail } from "./orders.js";

const router = express.Router();

// Initialize Paystack payment
router.post("/initialize", async (req, res) => {
  try {
    const { email, amount, reference, metadata } = req.body;

    console.log('🔑 Paystack Secret Key (first 10 chars):', process.env.PAYSTACK_SECRET_KEY?.substring(0, 10) + '...');
    console.log('📧 Payment request received:', {
      email,
      amount,
      reference,
      metadata
    });

    // Validate required fields
    if (!email || !amount || !reference) {
      return res.status(400).json({
        error: "Missing required fields: email, amount, and reference are required"
      });
    }

    console.log('💰 Initializing Paystack payment...');

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amount), // Convert to kobo
        reference,
        metadata,
        callback_url: `${process.env.APP_BASE_URL}/payment/verify`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000 // 30 second timeout
      }
    );

    console.log('✅ Paystack initialization successful:', {
      status: response.data.status,
      message: response.data.message,
      authorization_url: response.data.data?.authorization_url ? 'URL received' : 'No URL'
    });

    res.json(response.data);

  } catch (error) {
    console.error("❌ Paystack initialization failed:");
    console.error("Error status:", error.response?.status);
    console.error("Error data:", error.response?.data);
    console.error("Error message:", error.message);

    res.status(500).json({
      error: "Payment initialization failed",
      details: error.response?.data || error.message
    });
  }
});

// Verify Paystack payment
router.get("/verify/:reference", verifyToken, async (req, res) => {
  try {
    const { reference } = req.params;

    console.log('Verifying Paystack payment for reference:', reference);

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    console.log('Paystack verification response:', response.data);

    if (response.data.data.status === "success") {
      // Update order payment status
      const updateQuery = `
        UPDATE orders 
        SET payment_status = 'paid', payment_reference = $1 
        WHERE order_number = $2 
        RETURNING *
      `;

      const updateResult = await new Promise((resolve, reject) => {
        db.query(updateQuery, [reference, reference], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      if (updateResult.rows.length === 0) {
        console.error("No order found with reference:", reference);
        return res.status(404).json({ error: "Order not found" });
      }

      // Clear user's cart
      await new Promise((resolve, reject) => {
        db.query(
          "DELETE FROM cart_items WHERE user_id = $1",
          [req.user.id],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      // ✅ SEND EMAIL NOTIFICATION FOR PAID ORDER
      try {
        await sendOrderNotificationEmail(updatedOrder, 'online');
        console.log('✅ Payment confirmation email sent to admin');
        // Auto-subscribe customer to newsletter
        autoSubscribeCustomer(email, customer_name);
      } catch (emailError) {
        console.error('❌ Failed to send payment confirmation email:', emailError);
      }

      console.log('Payment verified and order updated successfully');
      res.json({
        success: true,
        message: "Payment verified successfully",
        order: updateResult.rows[0],
        payment: response.data.data
      });

    } else {
      console.log('Payment verification failed with status:', response.data.data.status);
      res.status(400).json({
        error: "Payment verification failed",
        status: response.data.data.status
      });
    }

  } catch (error) {
    console.error("Paystack verification error:", error);
    res.status(500).json({
      error: "Payment verification failed",
      details: error.message
    });
  }
});




// In payments.js - Enhanced mock response
// router.post("/initialize", async (req, res) => {
//   try {
//     const { email, amount, reference, metadata } = req.body;

//     console.log('💰 MOCK: Payment initialization for:', { email, amount, reference });

//     // Simulate API delay
//     await new Promise(resolve => setTimeout(resolve, 1000));

//     const mockResponse = {
//       status: true,
//       message: "Authorization URL created",
//       data: {
//         authorization_url: `${process.env.APP_BASE_URL}/payment/success?reference=${reference}`,
//         access_code: `mock_access_${reference}`,
//         reference: reference,
//         amount: amount / 100, // Convert back to Naira for display
//         currency: "NGN"
//       }
//     };

//     console.log('✅ MOCK: Payment initialization successful - redirecting to:', mockResponse.data.authorization_url);
//     res.json(mockResponse);

//   } catch (error) {
//     console.error("❌ Mock payment failed:", error);
//     res.status(500).json({
//       error: "Payment initialization failed",
//       details: error.message
//     });
//   }
// });

export default router;