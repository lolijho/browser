import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Radice del monorepo (due livelli sopra apps/admin): serve a Next per tracciare
// correttamente i package workspace nell'output `standalone` (fase 08).
const monorepoRoot = join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@businessbox/shared", "@businessbox/contracts"],
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
