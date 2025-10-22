import express from "express";
import db from "../utils/db.js";
import { verifyUser, verifyAdmin, verifyToken } from "../utils/authUtils.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// GET all orders (Admin)
router.get("/", verifyAdmin, (req, res) => {
  const query = `
    SELECT o.*, u.name as user_name, u.email as user_email 
    FROM orders o 
    LEFT JOIN users u ON o.user_id = u.id 
    ORDER BY o.created_at DESC
  `;

  db.query(query, [], (err, result) => {
    if (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result.rows);
  });
});

// CREATE order (Online payment)
router.post("/", verifyToken, async (req, res) => {
  try {
    const {
      customer_name,
      email,
      phone,
      address,
      city,
      state,
      items,
      subtotal,
      shipping,
      total,
      payment_reference,
      notes
    } = req.body;

    const user_id = req.user.id;

    // Generate unique order number
    const timestamp = Date.now();
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const order_number = `PALM-${timestamp}-${randomSuffix}`;

    console.log('Generated order number:', order_number);

    const query = `
      INSERT INTO orders 
      (user_id, order_number, customer_name, email, phone, address, city, state, 
       items, subtotal, shipping, total, payment_reference, notes, order_type, payment_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'online', 'pending')
      RETURNING *
    `;

    const values = [
      user_id,
      order_number,
      customer_name,
      email,
      phone,
      address,
      city,
      state,
      JSON.stringify(items),
      subtotal,
      shipping,
      total,
      payment_reference,
      notes || ''
    ];

    console.log('Executing query with values:', values);

    db.query(query, values, async (err, result) => {
      if (err) {
        console.error("Database error creating order:", err);
        console.error("Error details:", err.message, err.stack);
        return res.status(500).json({
          error: "Database error: " + err.message,
          details: err.detail
        });
      }

      console.log('Order created successfully:', result.rows[0]);

      const order = result.rows[0];

      // Auto-subscribe customer to newsletter
      autoSubscribeCustomer(email, customer_name);

      // Send email notification to admin
      await sendOrderNotificationEmail(order, 'online');

      res.status(201).json(order);
    });
  } catch (error) {
    console.error("Unexpected error creating order:", error);
    res.status(500).json({
      error: "Server error: " + error.message
    });
  }
});

// CREATE WhatsApp/Customer Service order
router.post("/whatsapp-order", verifyToken, async (req, res) => {
  try {
    console.log('Received WhatsApp order request:', req.body);

    const {
      customer_name,
      email,
      phone,
      address,
      city,
      state,
      items,
      subtotal,
      shipping,
      total,
      notes
    } = req.body;

    // Validate required fields
    if (!customer_name || !email || !phone || !address || !city || !state) {
      return res.status(400).json({
        error: "Missing required fields: customer_name, email, phone, address, city, state are required"
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Order must contain at least one item"
      });
    }

    const user_id = req.user.id;

    // Generate unique order number WITHOUT Math.random()
    const timestamp = Date.now();
    const randomSuffix = Math.floor(10000 + Math.random() * 90000); // 5-digit random
    const order_number = `WA-${timestamp}-${randomSuffix}`;

    console.log('Creating order with number:', order_number);

    const query = `
      INSERT INTO orders 
      (user_id, order_number, customer_name, email, phone, address, city, state, 
       items, subtotal, shipping, total, notes, order_type, payment_status, delivery_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'whatsapp', 'pending', 'awaiting_contact')
      RETURNING *
    `;

    const values = [
      user_id,
      order_number,
      customer_name,
      email,
      phone,
      address,
      city,
      state,
      JSON.stringify(items),
      subtotal,
      shipping,
      total,
      notes || ''
    ];

    console.log('Executing database query with values:', values);

    db.query(query, values, async (err, result) => {
      if (err) {
        console.error("Database error creating WhatsApp order:", err);
        return res.status(500).json({
          error: "Database error: " + err.message
        });
      }

      if (!result.rows || result.rows.length === 0) {
        console.error("No rows returned from database insert");
        return res.status(500).json({
          error: "Failed to create order - no data returned"
        });
      }

      const order = result.rows[0];
      console.log('Order created successfully:', order);

      try {
        // Auto-subscribe customer to newsletter
        autoSubscribeCustomer(email, customer_name);

        // Send email notification to admin
        await sendOrderNotificationEmail(order, 'whatsapp');

        res.status(201).json(order);
      } catch (notificationError) {
        console.error('Error in notification process:', notificationError);
        // Still return success since order was created, but log the notification error
        res.status(201).json(order);
      }
    });
  } catch (error) {
    console.error("Unexpected error creating WhatsApp order:", error);
    res.status(500).json({
      error: "Server error: " + error.message
    });
  }
});

// GET user orders
router.get("/my-orders", verifyToken, (req, res) => {
  const user_id = req.user.id;

  db.query(
    "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
    [user_id],
    (err, result) => {
      if (err) {
        console.error("Error fetching orders:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(result.rows);
    }
  );
});

// Send status update emails to customers
function sendOrderStatusUpdateEmail(order, previousStatus, newStatus) {
  try {
    const statusLabels = {
      'pending': 'Pending',
      'processing': 'Processing',
      'shipped': 'Shipped',
      'delivered': 'Delivered',
      'cancelled': 'Cancelled',
      'awaiting_contact': 'Awaiting Contact'
    };

    const statusDescriptions = {
      'pending': 'Your order has been received and is being processed.',
      'processing': 'We are currently preparing your order for shipment.',
      'shipped': 'Your order has been shipped and is on its way to you.',
      'delivered': 'Your order has been delivered successfully.',
      'cancelled': 'Your order has been cancelled.',
      'awaiting_contact': 'We are awaiting contact to confirm your order details.'
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #D84727, #2f7a32); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
          .order-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .status-update { background: #e8f5e8; border-left: 4px solid #2f7a32; padding: 15px; margin: 15px 0; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .items-table th, .items-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .items-table th { background: #f5f5f5; }
          .status-badge { 
            display: inline-block; 
            padding: 8px 16px; 
            border-radius: 20px; 
            font-weight: bold; 
            margin: 5px 0;
          }
          .pending { background: #fff3cd; color: #856404; }
          .processing { background: #cce7ff; color: #004085; }
          .shipped { background: #d1ecf1; color: #0c5460; }
          .delivered { background: #d4edda; color: #155724; }
          .cancelled { background: #f8d7da; color: #721c24; }
          .awaiting_contact { background: #ffeaa7; color: #5c3b28; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Order Status Update</h1>
            <p>Your order #${order.order_number} status has been updated</p>
          </div>
          
          <div class="content">
            <div class="status-update">
              <h2>Status Update</h2>
              <p>Your order status has been updated from <strong>${statusLabels[previousStatus]}</strong> to:</p>
              <div class="status-badge ${newStatus}">${statusLabels[newStatus]}</div>
              <p>${statusDescriptions[newStatus]}</p>
            </div>

            <div class="order-details">
              <h2>Order Information</h2>
              <p><strong>Order Number:</strong> #${order.order_number}</p>
              <p><strong>Customer Name:</strong> ${order.customer_name}</p>
              <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
              <p><strong>Total Amount:</strong> ₦${order.total?.toLocaleString()}</p>
            </div>

            <div class="order-details">
              <h2>Order Items</h2>
              <table class="items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Quantity</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items?.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td>${item.size}</td>
                      <td>${item.quantity}</td>
                      <td>₦${item.total?.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="order-details">
              <h2>Delivery Information</h2>
              <p><strong>Address:</strong> ${order.address}, ${order.city}, ${order.state}</p>
              <p><strong>Phone:</strong> ${order.phone}</p>
              <p><strong>Email:</strong> ${order.email}</p>
            </div>

            <div style="text-align: center; margin-top: 20px; padding: 15px; background: white; border-radius: 8px;">
              <p style="margin: 0; color: #666;">
                Thank you for choosing PalmPort! If you have any questions, please contact us.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"PalmPort Order Updates" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: `📦 Order Status Update - #${order.order_number} - ${statusLabels[newStatus]}`,
      html: emailHtml
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error('Error sending order status update email:', err);
      } else {
        console.log(`Order status update email sent to ${order.email} for order ${order.order_number}`);
      }
    });

  } catch (error) {
    console.error('Error preparing order status update email:', error);
  }
}

// PUT update order status (Admin)
router.put("/:id/status", verifyAdmin, (req, res) => {
  const { id } = req.params;
  const { delivery_status, payment_status } = req.body;

  console.log('Updating order status:', { id, delivery_status, payment_status });

  // Validate delivery_status if provided
  if (delivery_status && !['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'awaiting_contact'].includes(delivery_status)) {
    return res.status(400).json({ error: "Invalid delivery status" });
  }

  // Validate payment_status if provided
  if (payment_status && !['pending', 'paid', 'failed', 'refunded'].includes(payment_status)) {
    return res.status(400).json({ error: "Invalid payment status" });
  }

  // First, get the current order to know the previous status
  const getOrderQuery = "SELECT * FROM orders WHERE id = $1";

  db.query(getOrderQuery, [id], (err, getOrderResult) => {
    if (err) {
      console.error("Error fetching current order:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }

    if (getOrderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const currentOrder = getOrderResult.rows[0];
    const previousStatus = currentOrder.delivery_status;

    const updateQuery = `
      UPDATE orders 
      SET 
        delivery_status = COALESCE($1, delivery_status), 
        payment_status = COALESCE($2, payment_status),
        updated_at = NOW()
      WHERE id = $3 
      RETURNING *
    `;

    const values = [delivery_status, payment_status, id];

    console.log('Executing update query:', updateQuery);
    console.log('With values:', values);

    db.query(updateQuery, values, (err, result) => {
      if (err) {
        console.error("Error updating order:", err);
        return res.status(500).json({ error: "Database update error: " + err.message });
      }

      if (result.rows.length === 0) {
        console.error("No order found with ID:", id);
        return res.status(404).json({ error: "Order not found" });
      }

      const updatedOrder = result.rows[0];
      console.log('Order updated successfully:', updatedOrder);

      // Send status update email if delivery status changed
      if (delivery_status && delivery_status !== previousStatus) {
        sendOrderStatusUpdateEmail(updatedOrder, previousStatus, delivery_status);
      }

      res.json(updatedOrder);
    });
  });
});

// Whatsapp notification function
function sendWhatsAppNotification(order) {
  // WhatsApp number from environment variable
  const businessWhatsAppNumber = process.env.WHATSAPP_BUSINESS_NUMBER || '2348123456789';

  // Create message for customer to send to business
  const messageToBusiness = `
🛒 *NEW ORDER - PalmPort* 🌴

Order #: ${order.order_number}
Customer: ${order.customer_name}
Phone: ${order.phone}
Email: ${order.email}
Address: ${order.address}, ${order.city}, ${order.state}
Total: ₦${order.total?.toLocaleString()}

Items:
${order.items?.map(item => `• ${item.name} (${item.size}) - ${item.quantity}x - ₦${item.total}`).join('\n')}

Notes: ${order.notes || 'None'}

This order was placed via WhatsApp checkout.
  `.trim();

  // Create WhatsApp URL that opens user's WhatsApp with pre-filled message to your business
  const whatsappUrl = `https://wa.me/${businessWhatsAppNumber}?text=${encodeURIComponent(messageToBusiness)}`;

  console.log('📱 WhatsApp Business URL:', whatsappUrl);

  return {
    whatsapp_url: whatsappUrl,
    business_number: businessWhatsAppNumber,
    pre_filled_message: messageToBusiness
  };
}

// Auto-subscribe function
export function autoSubscribeCustomer(email, name = '') {
  if (!email || !email.includes('@')) return;

  // Insert into subscribers table
  const subscribeQuery = `
    INSERT INTO subscribers (email, created_at) 
    VALUES ($1, NOW()) 
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;

  db.query(subscribeQuery, [email], (err, result) => {
    if (err) {
      console.error('Error auto-subscribing customer:', err);
      return;
    }

    if (result.rows.length > 0) {
      console.log(`Auto-subscribed customer: ${email}`);

      // Send welcome email to new subscriber
      const welcomeEmail = {
        from: `"PalmPort Updates" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Welcome to PalmPort Updates! 🌴",
        html: `
          <div style="font-family: 'Segoe UI', sans-serif; padding: 20px; background-color: #f9f6f2; border-radius: 10px;">
            <h2 style="color: #D84727;">Thank you for your order and welcome to PalmPort Updates!</h2>
            <p>We're excited to have you as a customer and will keep you updated on:</p>
            <ul>
              <li>🛒 Your order status and tracking</li>
              <li>🌱 New palm oil batches and traceability</li>
              <li>🎉 Special offers and promotions</li>
              <li>📰 PalmPort news and updates</li>
            </ul>
            <p>Thank you for choosing PalmPort!</p>
          </div>
        `,
      };

      // Send email
      transporter.sendMail(welcomeEmail, (err) => {
        if (err) console.error('Error sending welcome email:', err);
      });
    }
  });
}

// Send order notification email to admin
export async function sendOrderNotificationEmail(order, orderType) {
  try {
    const orderTypeLabel = orderType === 'whatsapp' ? 'WhatsApp Order' : 'Online Order';
    const statusLabel = orderType === 'whatsapp' ? 'Awaiting Contact' : 'Pending Payment';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #D84727, #2f7a32); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
          .order-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .items-table th, .items-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .items-table th { background: #f5f5f5; }
          .status-badge { 
            display: inline-block; 
            padding: 5px 10px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-weight: bold; 
            margin-left: 10px;
          }
          .online { background: #e3f2fd; color: #1976d2; }
          .whatsapp { background: #e8f5e8; color: #2e7d32; }
          .action-button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #D84727; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛒 New Order Received!</h1>
            <p>${orderTypeLabel} - ${order.order_number}</p>
          </div>
          
          <div class="content">
            <div class="order-details">
              <h2>Order Summary</h2>
              <p><strong>Order Type:</strong> 
                <span class="status-badge ${orderType}">${orderTypeLabel}</span>
              </p>
              <p><strong>Status:</strong> ${statusLabel}</p>
              <p><strong>Order Number:</strong> ${order.order_number}</p>
              <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
              <p><strong>Total Amount:</strong> ₦${order.total?.toLocaleString()}</p>
            </div>

            <div class="order-details">
              <h2>Customer Information</h2>
              <p><strong>Name:</strong> ${order.customer_name}</p>
              <p><strong>Email:</strong> ${order.email}</p>
              <p><strong>Phone:</strong> ${order.phone}</p>
              <p><strong>Address:</strong> ${order.address}, ${order.city}, ${order.state}</p>
              ${order.notes ? `<p><strong>Customer Notes:</strong> ${order.notes}</p>` : ''}
            </div>

            <div class="order-details">
              <h2>Order Items</h2>
              <table class="items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items?.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td>${item.size}</td>
                      <td>${item.quantity}</td>
                      <td>₦${item.total?.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3" style="text-align: right; font-weight: bold;">Subtotal:</td>
                    <td>₦${order.subtotal?.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td colspan="3" style="text-align: right; font-weight: bold;">Shipping:</td>
                    <td>₦${order.shipping?.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td colspan="3" style="text-align: right; font-weight: bold;">Total:</td>
                    <td style="font-weight: bold; color: #D84727;">₦${order.total?.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <a href="${process.env.APP_BASE_URL}/admin/orders" class="action-button">
                View Order in Dashboard
              </a>
              ${orderType === 'whatsapp' ? `
                <a href="https://wa.me/${order.phone.replace(/^0/, '234')}" class="action-button" style="background: #25D366;">
                  Contact Customer on WhatsApp
                </a>
              ` : ''}
            </div>

            <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 5px;">
              <p style="margin: 0; color: #856404;">
                <strong>Action Required:</strong> 
                ${orderType === 'whatsapp'
        ? 'Please contact the customer via WhatsApp to confirm order details and arrange delivery.'
        : 'This order is awaiting payment confirmation via Paystack.'}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"PalmPort Order System" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `🛒 New ${orderTypeLabel} - ${order.order_number} - ${order.customer_name}`,
      html: emailHtml
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order notification email sent to admin for order ${order.order_number}`);

  } catch (error) {
    console.error('Error sending order notification email:', error);
  }
}

export default router;