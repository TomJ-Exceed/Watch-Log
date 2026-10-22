import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wrist Check",
    short_name: "Wrist Check",
    description: "Watch collection and daily wear log",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Quick log", short_name: "Quick log", description: "One tap to log today's watch", url: "/quick", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Today", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
