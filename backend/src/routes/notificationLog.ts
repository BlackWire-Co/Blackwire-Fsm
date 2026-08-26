import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { parsePagination } from "../lib/pagination";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));

router.get("/", async (req, res) => {
  const { status, channel } = req.query as Record<string, string | undefined>;
  const { page, pageSize, skip, take } = parsePagination(req);
  const where: any = {};
  if (status) where.status = { in: status.split(",") };
  if (channel) where.channel = { in: channel.split(",") };

  const [items, total] = await Promise.all([
    prisma.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notificationLog.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

export default router;
