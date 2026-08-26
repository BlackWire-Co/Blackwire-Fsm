import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const propertySchema = z.object({
  customerId: z.string().uuid(),
  label: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  unit: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
  accessInstructions: z.string().optional(),
  gateCode: z.string().optional(),
  hasPets: z.boolean().optional(),
  petNotes: z.string().optional(),
  entryInstructions: z.string().optional(),
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = propertySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const property = await prisma.property.create({ data: parsed.data });

  await logAudit({
    userId: req.user!.id,
    action: "property.created",
    entityType: "property",
    entityId: property.id,
  });

  res.status(201).json(property);
});

router.get("/:id", async (req, res) => {
  const property = await prisma.property.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      jobs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!property) return res.status(404).json({ error: "Property not found" });
  res.json(property);
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = propertySchema.partial().omit({ customerId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const property = await prisma.property.update({ where: { id: req.params.id }, data: parsed.data });
    await logAudit({
      userId: req.user!.id,
      action: "property.modified",
      entityType: "property",
      entityId: property.id,
    });
    res.json(property);
  } catch {
    res.status(404).json({ error: "Property not found" });
  }
});

export default router;
