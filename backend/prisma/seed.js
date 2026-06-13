import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin allow-list (kept in sync with ADMIN_EMAILS env used at login)
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'developer@tuninglog.local,allen940403allen@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const roleFor = (email) => (ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user');

  // Create a default developer bypass user (admin)
  const devUser = await prisma.user.upsert({
    where: { email: 'developer@tuninglog.local' },
    update: { role: roleFor('developer@tuninglog.local') },
    create: {
      googleId: 'dev-bypass-id-999',
      email: 'developer@tuninglog.local',
      name: '開發測試工程師',
      role: roleFor('developer@tuninglog.local'),
    },
  });

  console.log(`Developer user created: ${devUser.name} (${devUser.id}) role=${devUser.role}`);

  // Pre-provision the primary admin (Google) account so the published catalog is
  // owned by an admin and the account is admin on first Google login.
  const primaryAdminEmail = ADMIN_EMAILS.find((e) => e !== 'developer@tuninglog.local');
  if (primaryAdminEmail) {
    await prisma.user.upsert({
      where: { email: primaryAdminEmail },
      update: { role: 'admin' },
      create: {
        googleId: `seed-admin-${primaryAdminEmail}`,
        email: primaryAdminEmail,
        name: 'Administrator',
        role: 'admin',
      },
    });
    console.log(`Primary admin provisioned: ${primaryAdminEmail}`);
  }

  // Seed default vehicles as the published catalog (owned by the dev admin)
  const presetVehicles = [
    {
      name: 'Porsche 911 GT3 RS (991.2)',
      weightKg: 1430,
      horsepowerHp: 520,
      torqueNm: 470,
      modelPath: '/modle/2017_porsche_911_991_gt3_rs.glb',
      modelScale: 1.0,
      lengthM: 4.56,
      allowedParams: [
        'pressure_fl', 'pressure_fr', 'pressure_rl', 'pressure_rr',
        'aero_f', 'aero_r',
        'susp_h_f', 'susp_h_r', 'susp_d_f', 'susp_d_r'
      ]
    },
    {
      name: 'Formula SAE Racecar',
      weightKg: 210,
      horsepowerHp: 85,
      torqueNm: 65,
      modelPath: '/modle/2017_porsche_911_991_gt3_rs.glb',
      modelScale: 1.0,
      lengthM: 2.8,
      allowedParams: [
        'pressure_fl', 'pressure_fr', 'pressure_rl', 'pressure_rr',
        'susp_h_f', 'susp_h_r', 'susp_d_f', 'susp_d_r'
      ]
    },
    {
      name: 'Electric Rental Kart',
      weightKg: 95,
      horsepowerHp: 15,
      torqueNm: 22,
      modelPath: '/modle/2017_porsche_911_991_gt3_rs.glb',
      modelScale: 1.0,
      lengthM: 1.9,
      allowedParams: [
        'pressure_fl', 'pressure_fr', 'pressure_rl', 'pressure_rr'
      ]
    }
  ];

  for (const v of presetVehicles) {
    // Check if vehicle already exists
    const existing = await prisma.vehicle.findFirst({
      where: {
        userId: devUser.id,
        name: v.name,
      }
    });

    if (!existing) {
      await prisma.vehicle.create({
        data: {
          userId: devUser.id,
          name: v.name,
          weightKg: v.weightKg,
          horsepowerHp: v.horsepowerHp,
          torqueNm: v.torqueNm,
          modelPath: v.modelPath,
          modelScale: v.modelScale,
          lengthM: v.lengthM,
          allowedParams: v.allowedParams,
          isPublished: true,
        }
      });
      console.log(`Seeded published vehicle: ${v.name}`);
    } else {
      // Ensure existing presets become part of the published catalog with a length
      await prisma.vehicle.update({
        where: { id: existing.id },
        data: { isPublished: true, lengthM: existing.lengthM ?? v.lengthM }
      });
      console.log(`Published existing vehicle: ${v.name}`);
    }
  }

  console.log('Database seeding complete.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
