import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js must load its own worker/wasm from node_modules, not the bundle.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "sharp"],
  // Keep vendored OCR language data in the production trace/deploy.
  outputFileTracingIncludes: {
    "/api/ledger/receipts/read": ["./vendor/tessdata/**/*"],
  },
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
