import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The extension calls this API from a chrome-extension:// origin, which is opaque to
  // Next's defaults. CORS headers are set per route (see lib/cors.ts) rather than here,
  // so the dashboard pages stay same-origin only.
  reactStrictMode: true,
};

export default nextConfig;
