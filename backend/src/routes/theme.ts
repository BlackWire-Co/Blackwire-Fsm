import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getSettings } from "../lib/settings";

// Deliberately its own router, separate from routes/settings.ts (which is
// ADMIN-only end to end). Any logged-in staff member - not just admins -
// needs to receive the custom CSS override so it actually applies across
// the app; this endpoint exposes just that one field, read-only, to any
// authenticated user.
const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const settings = await getSettings();
  res.json({ customCss: settings.customCss || "" });
});

export default router;
