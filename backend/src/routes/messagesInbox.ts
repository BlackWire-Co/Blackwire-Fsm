import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { UserRole } from "@prisma/client";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.OFFICE));

// One row per customer who has at least one message, most recent first,
// with an unread count - an inbox view rather than having to open every
// customer individually to check for new messages.
router.get("/", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    where: { messages: { some: {} } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { fromCustomer: true, readAt: null } } } },
    },
  });

  const rows = customers
    .map((c) => ({
      customerId: c.id,
      customerName: `${c.firstName} ${c.lastName}`,
      lastMessage: c.messages[0],
      unreadCount: c._count.messages,
    }))
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

  res.json(rows);
});

export default router;
