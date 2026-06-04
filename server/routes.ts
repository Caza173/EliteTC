import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import multer from "multer";
import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
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
import { sendMagicLinkEmail } from "./email";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

function hashLoginCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  if (!googleClient) googleClient = new OAuth2Client(clientId);
  return googleClient;
}

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

  // Google Sign-In: client posts a Google ID token (credential) from
  // Google Identity Services; we verify it server-side and issue a session.
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    const client = getGoogleClient();
    if (!client) {
      res.status(503).json({ message: "Google sign-in not configured" });
      return;
    }
    const idToken = String(req.body?.idToken || req.body?.credential || "");
    if (!idToken) {
      res.status(400).json({ message: "idToken required" });
      return;
    }
    let payload: { sub: string; email?: string; email_verified?: boolean; name?: string } | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload() as typeof payload;
    } catch (err) {
      console.warn("[auth/google] verifyIdToken failed:", (err as Error).message);
      res.status(401).json({ message: "Invalid Google token" });
      return;
    }
    if (!payload || !payload.sub || !payload.email || payload.email_verified === false) {
      res.status(401).json({ message: "Invalid Google token" });
      return;
    }
    const email = payload.email.toLowerCase();
    const sub = payload.sub;

    let user = await storage.getUserByGoogleSub(sub);
    if (!user) {
      const byEmail = await storage.getUserByEmail(email);
      if (byEmail) {
        await storage.setUserGoogleSub(byEmail.id, sub);
        user = (await storage.getUserById(byEmail.id))!;
      } else {
        user = await storage.upsertUser({ email, name: payload.name ?? null, googleSub: sub });
      }
    }

    const token = await createSession(user.id);
    res.setHeader("Set-Cookie", buildSessionCookie(token, process.env.NODE_ENV === "production"));
    res.json({ user });
  });

  // Magic-link request: always returns 200 with the same shape regardless of
  // whether the email is known, to avoid account enumeration.
  app.post("/api/auth/magic-link/request", async (req: Request, res: Response) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ message: "valid email required" });
      return;
    }
    try {
      const code = crypto.randomBytes(24).toString("base64url");
      const codeHash = hashLoginCode(code);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
      await storage.createLoginCode(email, codeHash, expiresAt);
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      await sendMagicLinkEmail(email, code, baseUrl);
    } catch (err) {
      console.error("[auth/magic-link] request failed:", err);
    }
    res.json({ ok: true });
  });

  // Verify magic link: consumes the code, creates the user if new, issues
  // a session cookie. Accepts the same payload either via GET (link click)
  // or POST (form).
  const verifyHandler = async (req: Request, res: Response) => {
    const src = req.method === "GET" ? req.query : req.body;
    const email = String(src?.email || "").trim().toLowerCase();
    const code = String(src?.code || "");
    if (!email || !code) {
      res.status(400).json({ message: "email and code required" });
      return;
    }
    const ok = await storage.consumeLoginCode(email, hashLoginCode(code));
    if (!ok) {
      res.status(401).json({ message: "Invalid or expired link" });
      return;
    }
    const user = await storage.upsertUser({ email, name: null });
    const token = await createSession(user.id);
    res.setHeader("Set-Cookie", buildSessionCookie(token, process.env.NODE_ENV === "production"));
    if (req.method === "GET") {
      res.redirect("/");
      return;
    }
    res.json({ user });
  };
  app.get("/api/auth/verify", verifyHandler);
  app.post("/api/auth/verify", verifyHandler);

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

  // ----- settings: demo data -----
  // Reports how much seeded/demo/sample data the current user has. The
  // Settings UI uses this to enable/disable the "Delete demo data" action.
  app.get("/api/settings/demo-data", requireAuth, async (req: Request, res: Response) => {
    const counts = await storage.countDemoData(req.user!.id);
    res.json({ counts });
  });

  // Deletes ONLY records explicitly marked as demo/seed/sample and owned by
  // the current user. Real user-created records are never touched.
  app.post("/api/settings/demo-data/delete", requireAuth, async (req: Request, res: Response) => {
    const deleted = await storage.deleteDemoData(req.user!.id);
    if (deleted.total > 0) {
      await storage.writeAudit({
        actorId: req.user!.id,
        action: "delete",
        entity: "demo_data",
        payload: deleted,
      });
    }
    res.json({ deleted });
  });

  // ----- diagnostics -----
  // Auth-gated: leaks integration wiring (env flags, region, bucket) that
  // shouldn't be public on a production ALB.
  app.get("/api/diagnostics", requireAuth, (_req: Request, res: Response) => {
    res.json({
      node: process.version,
      env: process.env.NODE_ENV ?? "development",
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasSes: Boolean(process.env.SES_FROM_EMAIL),
      hasGoogle: Boolean(process.env.GOOGLE_CLIENT_ID),
      region: process.env.AWS_REGION ?? "us-east-1",
      documentsBucket: DOCUMENTS_BUCKET,
    });
  });
}
