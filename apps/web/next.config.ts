import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
