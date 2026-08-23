import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js must load its own worker/wasm from node_modules, not the bundle.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "sharp"],
  // Phone camera JPEGs often exceed the default proxy buffer; truncated
  // multipart then fails with "Failed to parse body as FormData".
  experimental: {
    proxyClientMaxBodySize: "20mb",
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
