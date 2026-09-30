import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Senior — Assistente pessoal", short_name: "Senior", description: "Converse, acompanhe seus projetos e mantenha suas decisões.",
    start_url: "/assistant", display: "standalone", background_color: "#0b1220", theme_color: "#0b1220",
    icons: [{ src: "/senior-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
