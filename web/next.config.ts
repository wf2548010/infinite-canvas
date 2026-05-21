import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseChangelog } from "@/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  loadEnvConfig(resolve(webDir, ".."), isDev, undefined, true);
  const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8080";
  const releases = parseChangelog(localChangelog);

  return {
    allowedDevOrigins: isDev ? ["*.*.*.*"] : [],
    typescript: {
      ignoreBuildErrors: true,
    },
    env: {
      NEXT_PUBLIC_APP_VERSION: localVersion,
      NEXT_PUBLIC_APP_RELEASES: JSON.stringify(releases),
    },
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${apiBaseUrl}/api/:path*` }];
    },
  };
}
