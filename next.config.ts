import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/wasm packages that must be loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs", "nodemailer"],
};

export default nextConfig;
