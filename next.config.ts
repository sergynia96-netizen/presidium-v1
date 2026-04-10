import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const corsOrigin =
  process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean)[0] ||
  process.env.NEXTAUTH_URL ||
  "http://localhost:3000";

function originFromUrl(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const relayHttpOrigin = originFromUrl(process.env.NEXT_PUBLIC_RELAY_HTTP_URL);
const relayWsOrigin = originFromUrl(process.env.NEXT_PUBLIC_RELAY_WS_URL);
const connectSources = [
  "'self'",
  "https://open.bigmodel.cn",
  relayHttpOrigin,
  relayWsOrigin,
].filter((source): source is string => Boolean(source));

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // Security headers
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'" + (isDev ? " 'unsafe-eval'" : ""),
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "font-src 'self'",
              `connect-src ${connectSources.join(" ")} ws: wss:`,
              "media-src 'self' blob: mediastream:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      {
        // CORS headers for API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: corsOrigin,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          {
            key: "Access-Control-Max-Age",
            value: "86400",
          },
        ],
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;
