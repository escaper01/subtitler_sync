import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The extension calls this API from a chrome-extension:// origin, which is opaque to
  // Next's defaults. CORS headers are set per route (see lib/api.ts) rather than here,
  // so the dashboard pages stay same-origin only.
  reactStrictMode: true,

  async redirects() {
    return [
      // `/pricing` was the paid-plans page. There are no plans, but the URL is in the
      // extension popup of every build already installed, and in whatever anyone linked
      // to — so it points at the donation page rather than 404ing.
      { source: '/pricing', destination: '/donate', permanent: true },
    ];
  },
};

export default nextConfig;
