import { PrismaClient, UserRole, JobStatus, JobPriority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      firstName: "Alex",
      lastName: "Admin",
      roles: [UserRole.ADMIN],
    },
  });

  await prisma.user.upsert({
    where: { email: "dispatch@example.com" },
    update: {},
    create: {
      email: "dispatch@example.com",
      passwordHash,
      firstName: "Dana",
      lastName: "Dispatcher",
      roles: [UserRole.OFFICE],
    },
  });

  const techNames = [
    ["John", "Ramirez"],
    ["Mike", "Chen"],
    ["Sam", "Whitfield"],
  ];
  const technicians = [];
  for (const [firstName, lastName] of techNames) {
    const tech = await prisma.user.upsert({
      where: { email: `${firstName.toLowerCase()}@example.com` },
      update: {},
      create: {
        email: `${firstName.toLowerCase()}@example.com`,
        passwordHash,
        firstName,
        lastName,
        roles: [UserRole.TECHNICIAN],
        phone: "555-010" + Math.floor(Math.random() * 9),
      },
    });
    technicians.push(tech);
  }

  const customerSeeds = [
    { firstName: "Jane", lastName: "Smith", phone: "555-0101", email: "jane.smith@example.com" },
    { firstName: "Robert", lastName: "Diaz", phone: "555-0102", email: "robert.diaz@example.com" },
    { firstName: "Linda", lastName: "Nguyen", phone: "555-0103", email: "linda.nguyen@example.com" },
    { firstName: "Marcus", lastName: "Webb", phone: "555-0104", email: "marcus.webb@example.com" },
    { firstName: "Priya", lastName: "Patel", phone: "555-0105", email: "priya.patel@example.com" },
    { firstName: "Tom", lastName: "OBrien", phone: "555-0106", email: "tom.obrien@example.com" },
    { firstName: "Grace", lastName: "Kim", companyName: "Kim Retail LLC", phone: "555-0107", email: "grace.kim@example.com" },
    { firstName: "Carlos", lastName: "Mendez", phone: "555-0108", email: "carlos.mendez@example.com" },
    { firstName: "Ella", lastName: "Fischer", phone: "555-0109", email: "ella.fischer@example.com" },
    { firstName: "Derek", lastName: "Holt", companyName: "Holt Properties", phone: "555-0110", email: "derek.holt@example.com" },
  ];

  const jobTitles = [
    "Electrical panel inspection",
    "Ceiling fan installation",
    "Outlet replacement",
    "HVAC seasonal tune-up",
    "Water heater repair",
    "Leaky faucet repair",
    "Circuit breaker tripping",
    "Thermostat installation",
    "Drain clog",
    "Light fixture install",
  ];

  let jobCount = 0;
  for (const [i, c] of customerSeeds.entries()) {
    const customer = await prisma.customer.create({
      data: {
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: (c as any).companyName,
        phone: c.phone,
        email: c.email,
        billingAddressLine1: `${100 + i} Main Street`,
        billingCity: "Springfield",
        billingState: "IL",
        billingZip: "62701",
      },
    });

    const propertyCount = i % 3 === 0 ? 2 : 1;
    const properties = [];
    for (let p = 0; p < propertyCount; p++) {
      const property = await prisma.property.create({
        data: {
          customerId: customer.id,
          label: p === 0 ? "Main House" : "Rental Property",
          addressLine1: `${100 + i + p * 40} ${p === 0 ? "Main Street" : "Oak Avenue"}`,
          city: "Springfield",
          state: "IL",
          zip: "62701",
          accessInstructions: p === 0 ? "Ring doorbell, dog is friendly" : "Lockbox code 4821",
          hasPets: p === 0,
        },
      });
      properties.push(property);
    }

    const jobsForCustomer = 2 + (i % 2);
    for (let j = 0; j < jobsForCustomer; j++) {
      jobCount++;
      const property = properties[j % properties.length];
      const tech = technicians[jobCount % technicians.length];
      const daysOffset = jobCount % 2 === 0 ? -jobCount : jobCount;
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + daysOffset);

      const isPast = daysOffset < 0;
      const status = isPast
        ? [JobStatus.COMPLETED, JobStatus.PAID][jobCount % 2]
        : [JobStatus.SCHEDULED, JobStatus.NEEDS_SCHEDULING, JobStatus.NEW][jobCount % 3];

      await prisma.job.create({
        data: {
          jobNumber: `JOB-${String(jobCount).padStart(6, "0")}`,
          customerId: customer.id,
          propertyId: property.id,
          title: jobTitles[jobCount % jobTitles.length],
          description: "Seed data job for demo purposes.",
          priority: [JobPriority.NORMAL, JobPriority.HIGH, JobPriority.LOW][jobCount % 3],
          status,
          scheduledDate: status === JobStatus.NEEDS_SCHEDULING ? null : scheduledDate,
          estimatedDurationMin: 60 + (jobCount % 3) * 30,
          technicians:
            status === JobStatus.NEEDS_SCHEDULING ? undefined : { create: [{ userId: tech.id }] },
          statusHistory: { create: { status, changedBy: admin.id } },
        },
      });
    }
  }

  console.log(`Seeded ${customerSeeds.length} customers and ${jobCount} jobs.`);
  console.log("Login as admin@example.com / ChangeMe123! (change this immediately).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
