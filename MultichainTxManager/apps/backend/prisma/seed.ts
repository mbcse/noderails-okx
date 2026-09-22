import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../src/config/database";
import { SETTING_DEFAULTS } from "../src/services/settings.service";

// ────────────────────────────────────────────────────────────
// Seed — creates default admin user + sample data
// ────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ── Admin user ─────────────────────────────────────────────

  const adminEmail = process.env.SEED_ADMIN_EMAIL; 
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  const existing = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    console.log(`  ✓ Admin "${adminEmail}" already exists — skipping`);
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword as string, 12);

    await prisma.adminUser.create({
      data: {
        email: adminEmail as string,
        name: "System Admin",
        hashedPassword,
        role: "OWNER",
      },
    });

    console.log(`  ✓ Created admin user: ${adminEmail}`);
    console.log(`    password: ${adminPassword}`);
  }

  // ── Sample project ─────────────────────────────────────────

  const existingProject = await prisma.project.findFirst({
    where: { name: "Demo Project" },
  });

  if (existingProject) {
    console.log('  ✓ Demo project already exists — skipping');
  } else {
    const project = await prisma.project.create({
      data: {
        name: "Demo Project",
        description: "Sample project for development and testing",
        apiKey: `mtxm_${nanoid(32)}`,
      },
    });

    console.log(`  ✓ Created demo project: ${project.name} (${project.id})`);
    console.log(`    apiKey: ${project.apiKey}`);

    // Add Ethereum Sepolia testnet chain
    await prisma.chain.create({
      data: {
        projectId: project.id,
        name: "Ethereum Sepolia",
        chainId: 11155111,
        rpcUrls: [
          "https://rpc.sepolia.org",
          "https://eth-sepolia.public.blastapi.io",
        ],
        explorerUrl: "https://sepolia.etherscan.io",
        nativeCurrency: "ETH",
        isTestnet: true,
      },
    });
    console.log("  ✓ Created chain: Ethereum Sepolia (11155111)");
  }

  // ── Default settings ────────────────────────────────────────
  for (const [key, def] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {
        label: def.label,
        description: def.description,
        category: def.category,
        dataType: def.dataType,
      },
      create: {
        key,
        value: def.value,
        label: def.label,
        description: def.description,
        category: def.category,
        dataType: def.dataType,
      },
    });
  }
  console.log(`  ✓ Seeded ${Object.keys(SETTING_DEFAULTS).length} settings`);

  console.log("\n✅ Seed complete");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
