import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }, { key: "X-Content-Type-Options", value: "nosniff" }] }];
  },
  /*
   * O repositório raiz do Senior também tem um package-lock.json
   * (é um projeto Node separado, não um monorepo compartilhado).
   * Sem isso, o Next.js infere a raiz errada a partir desse lockfile
   * externo.
   */
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
