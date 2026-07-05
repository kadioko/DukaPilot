/**
 * One-shot script: upsert DukaPilot admin users.
 * Run via: railway run --service DukaPilot node scripts/upsert-admin.js
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

    const adminPin = "4467";
    const pin = await bcrypt.hash(adminPin, 10);
    const admins = [
      { phone: "+255743910580", name: "Admin DukaPilot" },
      { phone: "+255713712057", name: "Admin DukaPilot 2" },
    ];
    const { randomUUID } = require("crypto");

    // Delete old placeholder admin if it exists
    const del = await pool.query(
      "DELETE FROM users WHERE phone = $1 AND role = 'ADMIN' RETURNING phone",
      ["+255700000000"]
    );
    if (del.rowCount > 0) {
      console.log("Deleted old admin:", del.rows[0].phone);
    }

    // Upsert admins
    const now = new Date().toISOString();
    const upserted = [];
    for (const admin of admins) {
      const result = await pool.query(
        `INSERT INTO users (id, phone, pin, name, role, language, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'ADMIN', 'sw', $5, $5)
         ON CONFLICT (phone) DO UPDATE
           SET pin = EXCLUDED.pin, name = EXCLUDED.name, role = 'ADMIN', "updatedAt" = $5
         RETURNING id, phone, name, role`,
        [randomUUID(), admin.phone, pin, admin.name, now]
      );
      upserted.push(result.rows[0]);
    }

    console.log("Admins upserted:", upserted);
    console.log("");
    console.log("=== SUCCESS ===");
    console.log("Login PIN for both admins =", adminPin);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
