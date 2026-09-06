import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getBookingSettings, getAvailableSlots, zonedYMDString } from "../lib/booking";
import { nextJobNumber } from "../lib/numbering";
import { notifyCustomer, notifyAdmin } from "../lib/notify";
import { JobStatus } from "@prisma/client";

// Fully public, unauthenticated router - anyone on the internet can hit
// these. Two separate limits rather than one shared one: loading the
// booking page and checking a few dates is normal, harmless read traffic
// and needs real headroom (a single visitor easily fires a dozen+ requests
// just stepping through the wizard), while actually submitting a booking is
// a "write from a stranger" and stays tightly capped, same as login.
const router = Router();

const readLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

router.use(readLimiter);

// Thrown inside the booking transaction below when a slot loses the race
// to another booking - caught right after and turned into a clean 409.
class SlotTakenError extends Error {}

router.get("/settings", async (_req, res) => {
  const settings = await getBookingSettings();
  if (!settings.enabled) return res.json({ enabled: false });
  res.json({
    enabled: true,
    timezone: settings.timezone,
    arrivalWindowMin: settings.arrivalWindowMin,
    minNoticeHours: settings.minNoticeHours,
    maxAdvanceDays: settings.maxAdvanceDays,
    requireAddress: settings.requireAddress,
    requirePhone: settings.requirePhone,
    requireEmail: settings.requireEmail,
    requireNotes: settings.requireNotes,
    confirmationNote: settings.confirmationNote,
  });
});

router.get("/services", async (_req, res) => {
  const settings = await getBookingSettings();
  if (!settings.enabled) return res.json([]);
  const services = await prisma.bookingService.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(services);
});

router.get("/providers", async (_req, res) => {
  const settings = await getBookingSettings();
  if (!settings.enabled) return res.json([]);
  const providers = await prisma.bookingProvider.findMany({
    where: { active: true },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  res.json(providers.map((p) => ({ id: p.id, name: `${p.user.firstName} ${p.user.lastName}` })));
});

const availabilityQuerySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  providerId: z.string().optional(),
});

router.get("/availability", async (req, res) => {
  const parsed = availabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "serviceId and date (YYYY-MM-DD) are required" });
  const result = await getAvailableSlots(parsed.data);
  res.json(result);
});

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  providerId: z.string().optional(),
  start: z.string().datetime(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/", writeLimiter, async (req, res) => {
  const settings = await getBookingSettings();
  if (!settings.enabled) return res.status(400).json({ error: "Online booking isn't available right now." });

  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const email = data.email || undefined;

  if (settings.requireAddress && !data.addressLine1) return res.status(400).json({ error: "Address is required" });
  if (settings.requirePhone && !data.phone) return res.status(400).json({ error: "Phone number is required" });
  if (settings.requireEmail && !email) return res.status(400).json({ error: "Email is required" });
  if (settings.requireNotes && !data.notes) return res.status(400).json({ error: "Please tell us what you need done" });
  if (!email && !data.phone) return res.status(400).json({ error: "An email or phone number is required so we can reach you" });

  const service = await prisma.bookingService.findUnique({ where: { id: data.serviceId } });
  if (!service || !service.active) return res.status(404).json({ error: "That service is no longer available" });

  const startTime = new Date(data.start);
  const endTime = new Date(startTime.getTime() + service.durationMin * 60000);

  // Re-validate the slot is still open (someone else may have grabbed it, or
  // it may simply be too soon per the minimum-notice setting) and, for "Any
  // Available", decide which provider actually gets it.
  const dateStr = zonedYMDString(startTime, settings.timezone);
  const availability = await getAvailableSlots({ serviceId: data.serviceId, date: dateStr, providerId: data.providerId });
  const match = availability.slots.find((s) => s.start === startTime.toISOString());
  if (!match || match.blocked) return res.status(409).json({ error: "That time slot is no longer available. Please pick another." });

  const providerId = data.providerId || match.providerIds[0];
  const provider = await prisma.bookingProvider.findUnique({ where: { id: providerId }, include: { user: true } });
  if (!provider || !provider.active) return res.status(409).json({ error: "That provider is no longer available." });

  // Match-or-create the customer, same "find by email, else by phone, else
  // create" pattern used by the staff-side customer import.
  let customer = email ? await prisma.customer.findFirst({ where: { email } }) : null;
  if (!customer && data.phone) {
    customer = await prisma.customer.findFirst({ where: { OR: [{ phone: data.phone }, { mobilePhone: data.phone }] } });
  }
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email,
        phone: data.phone || undefined,
      },
    });
    if (data.phone) {
      await prisma.customerPhone.create({ data: { customerId: customer.id, label: "Phone", number: data.phone, isPrimary: true } });
    }
    if (email) {
      await prisma.customerEmail.create({ data: { customerId: customer.id, label: "Primary", address: email, isPrimary: true } });
    }
  }

  let property = data.addressLine1
    ? await prisma.property.findFirst({ where: { customerId: customer.id, addressLine1: { equals: data.addressLine1, mode: "insensitive" } } })
    : await prisma.property.findFirst({ where: { customerId: customer.id } });
  if (!property) {
    property = await prisma.property.create({
      data: {
        customerId: customer.id,
        label: "Main",
        addressLine1: data.addressLine1 || "",
        city: data.city || "",
        state: data.state || "",
        zip: data.zip || "",
      },
    });
  }

  // Two customers can otherwise both pass the availability check above for
  // the exact same slot and both end up booked - the check and the write
  // aren't atomic on their own. Locking the chosen provider's row for the
  // rest of this transaction serializes concurrent bookings against that
  // one provider: whichever request gets here first finishes and commits,
  // the other blocks until then and re-runs the availability check fresh
  // (which will now see the first booking and correctly reject it).
  // Different providers, and every read-only lookup, are unaffected and
  // keep running fully in parallel.
  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "booking_providers" WHERE id = ${providerId} FOR UPDATE`;

      const recheck = await getAvailableSlots({ serviceId: data.serviceId, date: dateStr, providerId });
      const stillFree = recheck.slots.some(
        (s) => s.start === startTime.toISOString() && !s.blocked && s.providerIds.includes(providerId)
      );
      if (!stillFree) throw new SlotTakenError();

      const jobNumber = await nextJobNumber();
      return tx.job.create({
        data: {
          jobNumber,
          customerId: customer!.id,
          propertyId: property!.id,
          title: service.name,
          description: service.description || undefined,
          problemRequest: data.notes || undefined,
          status: JobStatus.SCHEDULED,
          scheduledDate: startTime,
          startTime,
          endTime,
          estimatedDurationMin: service.durationMin,
          source: "PUBLIC_BOOKING",
          bookedServiceId: service.id,
          bookedPrice: service.price,
          technicians: { create: { userId: provider.userId } },
          statusHistory: { create: { status: JobStatus.SCHEDULED, note: "Booked online" } },
        },
      });
    });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return res.status(409).json({ error: "That time slot was just booked by someone else. Please pick another." });
    }
    throw err;
  }

  const arrivalWindowEnd = new Date(startTime.getTime() + settings.arrivalWindowMin * 60000);
  const address = [property.addressLine1, property.city, property.state].filter(Boolean).join(", ");
  const scheduledDateLabel = startTime.toLocaleString("en-US", { timeZone: settings.timezone, dateStyle: "full", timeStyle: "short" });
  const arrivalWindow = `${startTime.toLocaleTimeString("en-US", { timeZone: settings.timezone, hour: "numeric", minute: "2-digit" })} - ${arrivalWindowEnd.toLocaleTimeString("en-US", { timeZone: settings.timezone, hour: "numeric", minute: "2-digit" })}`;
  const servicePrice = `$${Number(service.price).toFixed(2)}`;
  const providerName = `${provider.user.firstName} ${provider.user.lastName}`;

  const emailVars = {
    jobTitle: service.name,
    servicePrice,
    address,
    scheduledDate: scheduledDateLabel,
    arrivalWindow,
    providerName,
    confirmationNote: settings.confirmationNote || "",
  };

  await notifyCustomer({
    templateKey: "BOOKING_CONFIRMATION",
    customer,
    variables: emailVars,
    relatedType: "job",
    relatedId: job.id,
  });

  await notifyAdmin({
    templateKey: "BOOKING_NOTIFICATION_ADMIN",
    variables: {
      ...emailVars,
      customerName: `${customer.firstName} ${customer.lastName}`,
      customerPhone: customer.phone || "",
      customerEmail: customer.email || "",
    },
    relatedType: "job",
    relatedId: job.id,
  });

  res.status(201).json({
    ok: true,
    jobNumber: job.jobNumber,
    service: { name: service.name, price: service.price },
    scheduledDate: startTime,
    arrivalWindow,
    confirmationNote: settings.confirmationNote,
  });
});

export default router;
