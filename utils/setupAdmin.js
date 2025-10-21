// server/utils/setupAdmin.js
import bcrypt from "bcryptjs";
import db from "./db.js";
import dotenv from "dotenv";
dotenv.config();

function dbQueryAsync(text, params = []) {
  return new Promise((resolve, reject) => {
    db.query(text, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

export async function ensureAdminExists(adminEmail, adminPassword) {
  try {
    if (!adminEmail || !adminPassword) {
      console.warn("ADMIN_EMAIL or ADMIN_PASSWORD not set in env; skipping admin creation.");
      return;
    }

    // Check if admin exists
    const check = await dbQueryAsync("SELECT * FROM users WHERE email = $1", [adminEmail]);
    if (check.rows && check.rows.length > 0) {
      console.log("✅ Admin account already exists.");
      return;
    }

    // Hash password and insert admin
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await dbQueryAsync(
      `INSERT INTO users (name, email, password, role, created_at)
       VALUES ($1, $2, $3, 'admin', NOW())`,
      ["Admin", adminEmail, hashedPassword]
    );

    console.log("👑 Admin account created successfully!");
  } catch (err) {
    console.error("❌ Error ensuring admin account:", err);
    throw err;
  }
}
