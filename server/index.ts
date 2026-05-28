import "dotenv/config";
import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let captured: Record<string, any> | undefined;
  const originalJson = res.json;
  res.json = function (body, ...args) {
    captured = body;
    return originalJson.apply(res, [body, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let line = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (captured && res.statusCode >= 400) line += ` :: ${JSON.stringify(captured)}`;
      log(line);
    }
  });
  next();
});

let appReady = false;

// /healthz answers immediately so the ALB considers the container alive
// while bootstrap/migrations are running.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, ready: appReady });
});

// /ready returns 200 only after bootstrap completes — used by ECS as the
// strict health check to roll-replace any task whose bootstrap hung.
app.get("/ready", (_req, res) => {
  if (appReady) res.status(200).json({ ok: true, ready: true });
  else res.status(503).json({ ok: false, ready: false });
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`serving on port ${port}`);
});

(async () => {
  let routesRegistered = false;
  try {
    await registerRoutes(httpServer, app);
    routesRegistered = true;
  } catch (err) {
    console.error("Fatal error during registerRoutes/bootstrap:", err);
  }

  try {
    if (!routesRegistered) {
      app.use("/api", (_req: Request, res: Response) => {
        res.status(503).json({
          message: "API is starting up. Please try again in a few seconds.",
          ready: false,
        });
      });
    }

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    appReady = routesRegistered;
    log(
      routesRegistered
        ? "bootstrap complete; app fully ready"
        : "bootstrap PARTIAL: routes failed but static is mounted; investigate logs",
    );
  } catch (err) {
    console.error("Fatal error mounting static/vite:", err);
  }
})();
