import type { Express } from "express";
import type { Server } from "node:http";

// Dev-only Vite middleware. Imported dynamically so production builds never
// pull in the dev server. Mounting Vite as middleware lets a single Node
// process serve both /api and the React app with HMR in dev.
export async function setupVite(_httpServer: Server, app: Express) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
