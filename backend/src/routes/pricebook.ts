import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { parsePagination } from "../lib/pagination";
import { toCsv, parseCsv } from "../lib/csv";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative(),
  taxable: z.boolean().optional(),
});

// Anyone logged in can read the price book (technicians need it to quickly
// add priced materials on-site); only admin/office can maintain the catalog.
router.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const includeInactive = req.query.includeInactive === "true";
  const { page, pageSize, skip, take } = parsePagination(req, 50, 500);

  const where: any = includeInactive ? {} : { active: true };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.priceBookItem.findMany({ where, orderBy: { name: "asc" }, skip, take }),
    prisma.priceBookItem.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.priceBookItem.create({ data: parsed.data });
  await logAudit({ userId: req.user!.id, action: "pricebook.item_created", entityType: "priceBookItem", entityId: item.id });
  res.status(201).json(item);
});

const PRICEBOOK_EXPORT_COLUMNS = ["name", "sku", "description", "cost", "salePrice", "taxable", "active"];

router.get("/export.csv", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (_req, res) => {
  const items = await prisma.priceBookItem.findMany({ orderBy: { name: "asc" } });
  const csv = toCsv(items, PRICEBOOK_EXPORT_COLUMNS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="price-book.csv"');
  res.send(csv);
});

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/import", requireRole(UserRole.ADMIN, UserRole.OFFICE), csvUpload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided (field name: file)" });

  const { rows, parseErrors } = parseCsv(req.file.buffer);
  const errors: string[] = [...parseErrors];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const salePrice = Number(row.salePrice);
    if (!row.name?.trim() || Number.isNaN(salePrice)) {
      errors.push(`Row ${rowNum}: name and a numeric salePrice are required`);
      continue;
    }
    try {
      await prisma.priceBookItem.create({
        data: {
          name: row.name.trim(),
          sku: row.sku || undefined,
          description: row.description || undefined,
          cost: row.cost ? Number(row.cost) : 0,
          salePrice,
          taxable: row.taxable ? row.taxable.trim().toLowerCase() !== "false" : true,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`Row ${rowNum}: ${err.message}`);
    }
  }

  await logAudit({ userId: req.user!.id, action: "pricebook.imported", entityType: "priceBookItem", metadata: { created, errorCount: errors.length } });
  res.json({ created, errors });
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = itemSchema.partial().extend({ active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const item = await prisma.priceBookItem.update({ where: { id: req.params.id }, data: parsed.data });
    await logAudit({ userId: req.user!.id, action: "pricebook.item_modified", entityType: "priceBookItem", entityId: item.id });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Price book item not found" });
  }
});

export default router;
