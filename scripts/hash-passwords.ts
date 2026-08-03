import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/passwords";

async function runPasswordMigration() {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  console.log(`Hashing password for account "${adminUsername}"...`);

  const hashedPassword = hashPassword(adminPassword);

  // Update existing user or insert if not exists
  const existing: any[] = await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "User" WHERE "username" = $1 LIMIT 1`,
    adminUsername
  );

  if (existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "password" = $1, "role" = 'ADMIN', "assignedBranch" = NULL WHERE "username" = $2`,
      hashedPassword,
      adminUsername
    );
    console.log(`Successfully hashed and updated password for user "${adminUsername}".`);
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("username", "password", "role", "assignedBranch") VALUES ($1, $2, 'ADMIN', NULL)`,
      adminUsername,
      hashedPassword
    );
    console.log(`Successfully created user "${adminUsername}" with hashed password.`);
  }

  // Also hash any other unhashed accounts in DB if present
  const allUsers: any[] = await prisma.$queryRawUnsafe(`SELECT "id", "username", "password" FROM "User"`);
  for (const u of allUsers) {
    if (!u.password.includes(":")) {
      const h = hashPassword(u.password);
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "password" = $1 WHERE "id" = $2`, h, u.id);
      console.log(`Updated legacy account "${u.username}" to hashed password.`);
    }
  }
}

runPasswordMigration()
  .then(() => console.log("Password hash migration completed successfully."))
  .catch((err) => console.error("Migration error:", err))
  .finally(() => prisma.$disconnect());
