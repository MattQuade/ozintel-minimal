import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js must load its own worker/wasm from node_modules, not the bundle.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "sharp"],
};

export default nextConfig;
