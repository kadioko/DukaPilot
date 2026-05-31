/**
 * One-shot script: upsert admin user with new phone number.
 * Run via: railway run --service DukaOS node scripts/upsert-admin.js
 * Uses DATABASE_MIGRATE_URL (public proxy) if set, else DATABASE_URL.
 */
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

async function main() {
  const connStr =
    process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
  console.log("Connecting to:", connStr ? connStr.replace(/:([^:@]+)@/, ":***@") : "(no URL)");

  const pool = new Pool({
    connectionString: connStr,
    ssl: connStr && connStr.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });

  try {
    // Check existing admins
    const existing = await pool.query(
      "SELECT id, phone, name FROM users WHERE role = 'ADMIN'"
    );
    console.log("Existing admins:", existing.rows);

    const newPhone = "+255743910580";
    const pin = await bcrypt.hash("1234", 10);
    const { randomUUID } = require("crypto");

    // Delete old placeholder admin if it exists
    const del = await pool.query(
      "DELETE FROM users WHERE phone = $1 AND role = 'ADMIN' RETURNING phone",
      ["+255700000000"]
    );
    if (del.rowCount > 0) {
      console.log("Deleted old admin:", del.rows[0].phone);
    }

    // Upsert new admin
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO users (id, phone, pin, name, role, language, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ADMIN', 'sw', $5, $5)
       ON CONFLICT (phone) DO UPDATE
         SET pin = EXCLUDED.pin, name = EXCLUDED.name, "updatedAt" = $5
       RETURNING id, phone, name, role`,
      [randomUUID(), newPhone, pin, "Admin DukaOS", now]
    );

    console.log("Admin upserted:", result.rows[0]);
    console.log("");
    console.log("=== SUCCESS ===");
    console.log("Login: phone =", newPhone, "| PIN = 1234");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
