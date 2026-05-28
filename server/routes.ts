import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import multer from "multer";
import crypto from "node:crypto";
import { storage, bootstrap } from "./storage";
import {
  attachUser,
  requireAuth,
  createSession,
  destroySession,
  buildSessionCookie,
  buildClearSessionCookie,
  SESSION_COOKIE,
} from "./auth";
import { insertTransactionSchema } from "@shared/schema";
import { DOCUMENTS_BUCKET, putObject, presignedGetUrl } from "./s3";
import { ocrFromBytes } from "./ocr";
import { parseContractText } from "./openai-parse";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export async function registerRoutes(_httpServer: Server, app: Express): Promise<void> {
  await bootstrap();

  app.use(attachUser);

  // ----- auth -----
  app.get("/api/me", (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    res.json({ user: req.user });
  });

  // Dev-only login by email. Production must use Google or magic link.
  app.post("/api/auth/dev-login", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "true") {
      res.status(403).json({ message: "Dev login disabled in production" });
      return;
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      res.status(400).json({ message: "email required" });
      return;
    }
    const user = await storage.upsertUser({ email, name: req.body?.name ?? null });
    const token = await createSession(user.id);
    res.setHeader("Set-Cookie", buildSessionCookie(token, process.env.NODE_ENV === "production"));
    res.json({ user });
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const cookieHeader = req.headers.cookie ?? "";
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (match) await destroySession(decodeURIComponent(match[1]));
    res.setHeader("Set-Cookie", buildClearSessionCookie(process.env.NODE_ENV === "production"));
    res.json({ ok: true });
  });

  // ----- transactions -----
  app.get("/api/transactions", requireAuth, async (req: Request, res: Response) => {
    const rows = await storage.listTransactions(req.user!.id);
    res.json({ transactions: rows });
  });

  app.post("/api/transactions", requireAuth, async (req: Request, res: Response) => {
    const parse = insertTransactionSchema
      .omit({ id: true, createdAt: true, updatedAt: true })
      .safeParse({ ...req.body, ownerId: req.user!.id });
    if (!parse.success) {
      res.status(400).json({ message: "invalid transaction", errors: parse.error.flatten() });
      return;
    }
    const tx = await storage.createTransaction(parse.data);
    await storage.writeAudit({
      actorId: req.user!.id,
      transactionId: tx.id,
      action: "create",
      entity: "transaction",
      entityId: tx.id,
    });
    res.status(201).json({ transaction: tx });
  });

  app.get("/api/transactions/:id", requireAuth, async (req: Request, res: Response) => {
    const tx = await storage.getTransaction(String(req.params.id), req.user!.id);
    if (!tx) {
      res.status(404).json({ message: "not found" });
      return;
    }
    const [contacts, documents, tasks, deadlines] = await Promise.all([
      storage.listContacts(tx.id),
      storage.listDocuments(tx.id),
      storage.listTasks(tx.id),
      storage.listDeadlines(tx.id),
    ]);
    res.json({ transaction: tx, contacts, documents, tasks, deadlines });
  });

  // ----- documents: upload + OCR + OpenAI parse pipeline -----
  app.post(
    "/api/transactions/:id/documents",
    requireAuth,
    upload.single("file"),
    async (req: Request, res: Response) => {
      const tx = await storage.getTransaction(String(req.params.id), req.user!.id);
      if (!tx) {
        res.status(404).json({ message: "transaction not found" });
        return;
      }
      const file = req.file;
      if (!file) {
        res.status(400).json({ message: "file required" });
        return;
      }

      const sha = crypto.createHash("sha256").update(file.buffer).digest("hex");
      const key = `${tx.id}/${sha}-${file.originalname}`;
      const skipS3 = process.env.SKIP_S3_UPLOAD === "true";

      if (!skipS3) {
        try {
          await putObject(key, file.buffer, file.mimetype);
        } catch (err) {
          console.error("[documents] S3 upload failed:", err);
          res.status(502).json({ message: "S3 upload failed" });
          return;
        }
      }

      let ocrText: string | null = null;
      let ocrStatus = "pending";
      try {
        ocrText = await ocrFromBytes(file.buffer);
        ocrStatus = "complete";
      } catch (err) {
        console.warn("[documents] OCR failed:", (err as Error).message);
        ocrStatus = "failed";
      }

      let parsed: unknown = null;
      let parseStatus = "skipped";
      if (ocrText && process.env.OPENAI_API_KEY) {
        try {
          parsed = await parseContractText(ocrText);
          parseStatus = "complete";
        } catch (err) {
          console.warn("[documents] OpenAI parse failed:", (err as Error).message);
          parseStatus = "failed";
        }
      }

      await storage.writeAudit({
        actorId: req.user!.id,
        transactionId: tx.id,
        action: "upload",
        entity: "document",
        payload: { filename: file.originalname, ocrStatus, parseStatus },
      });

      res.status(201).json({
        document: {
          filename: file.originalname,
          sizeBytes: file.size,
          contentType: file.mimetype,
          s3Bucket: skipS3 ? null : DOCUMENTS_BUCKET,
          s3Key: skipS3 ? null : key,
          sha256: sha,
          ocrStatus,
          parseStatus,
          parsed,
        },
      });
    },
  );

  app.get(
    "/api/documents/:key/url",
    requireAuth,
    async (req: Request, res: Response) => {
      const key = decodeURIComponent(String(req.params.key));
      try {
        const url = await presignedGetUrl(key);
        res.json({ url });
      } catch (err) {
        console.error("[documents] presign failed:", err);
        res.status(502).json({ message: "presign failed" });
      }
    },
  );

  // ----- diagnostics -----
  app.get("/api/diagnostics", (_req: Request, res: Response) => {
    res.json({
      node: process.version,
      env: process.env.NODE_ENV ?? "development",
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasSes: Boolean(process.env.SES_FROM_EMAIL),
      region: process.env.AWS_REGION ?? "us-east-1",
      documentsBucket: DOCUMENTS_BUCKET,
    });
  });
}
