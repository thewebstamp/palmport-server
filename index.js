import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
import batchesRouter from './routes/batches.js';
import ordersRouter from './routes/orders.js';
import adminRoutes from "./routes/admin.js";
import subscribeRoutes from "./routes/subscribe.js";
import { ensureAdminExists } from "./utils/setupAdmin.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import productRoutes from "./routes/products.js";
import shippingRoutes from "./routes/shipping.js";
import paymentRoutes from "./routes/payments.js";

dotenv.config();
const app = express();

app.use(cors({
  origin: [`${process.env.APP_BASE_URL}`, 'http://localhost:3000']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure admin user exists at startup
ensureAdminExists(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

app.use('/api/batches', batchesRouter);
app.use('/api/orders', ordersRouter);
app.use("/api/admin", adminRoutes);
app.use("/api/subscribe", subscribeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/products', productRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/payments", paymentRoutes);

(async () => {
  try {
    // Ensure admin exists before starting to accept traffic
    await ensureAdminExists(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server due to setup error:", err);
    process.exit(1);
  }
})();
