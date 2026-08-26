import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth";
import customerRoutes from "./routes/customers";
import propertyRoutes from "./routes/properties";
import jobRoutes from "./routes/jobs";
import dashboardRoutes from "./routes/dashboard";
import materialRoutes from "./routes/materials";
import timeEntryRoutes from "./routes/timeEntries";
import photoRoutes from "./routes/photos";
import signatureRoutes from "./routes/signatures";
import estimateRoutes from "./routes/estimates";
import invoiceRoutes from "./routes/invoices";
import paymentRoutes from "./routes/payments";
import pricebookRoutes from "./routes/pricebook";
import emailTemplateRoutes from "./routes/emailTemplates";
import notificationLogRoutes from "./routes/notificationLog";
import portalAuthRoutes from "./routes/portalAuth";
import portalRoutes from "./routes/portal";
import messagesInboxRoutes from "./routes/messagesInbox";
import settingsRoutes from "./routes/settings";
import reportsRoutes from "./routes/reports";
import { ensureBucket } from "./lib/storage";
import { ensureDefaultTemplates } from "./lib/templates";
import { ensureSettings } from "./lib/settings";
import { startScheduler } from "./lib/scheduler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());

  // Generic API rate limit; login has its own tighter limiter.
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/properties", propertyRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api/jobs/:jobId/materials", materialRoutes);
  app.use("/api/jobs/:jobId/time-entries", timeEntryRoutes);
  app.use("/api/jobs/:jobId/photos", photoRoutes);
  app.use("/api/jobs/:jobId/signatures", signatureRoutes);
  app.use("/api/estimates", estimateRoutes);
  app.use("/api/invoices", invoiceRoutes);
  app.use("/api/invoices/:invoiceId/payments", paymentRoutes);
  app.use("/api/pricebook", pricebookRoutes);
  app.use("/api/email-templates", emailTemplateRoutes);
  app.use("/api/notification-log", notificationLogRoutes);
  app.use("/api/messages-inbox", messagesInboxRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/portal/auth", portalAuthRoutes);
  app.use("/api/portal", portalRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  ensureBucket().catch((err) => console.error("Could not ensure MinIO bucket exists:", err.message));
  ensureDefaultTemplates().catch((err) => console.error("Could not seed default email templates:", err.message));
  ensureSettings().catch((err) => console.error("Could not seed default settings:", err.message));
  startScheduler();

  // Consistent error shape for anything that throws past a route handler.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Internal server error" });
  });

  return app;
}
