import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "node:fs/promises";

// Bundle these into dist/index.cjs to reduce openat(2) syscalls on cold
// start and to make the runtime image self-contained for the server entry.
const allowlist = [
  "@aws-sdk/client-s3",
  "@aws-sdk/client-sesv2",
  "@aws-sdk/client-textract",
  "@aws-sdk/s3-request-presigner",
  "cookie",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "multer",
  "openai",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
