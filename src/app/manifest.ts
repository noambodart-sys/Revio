import type { MetadataRoute } from "next";
import { PRODUCT_NAME } from "@/config/product";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PRODUCT_NAME} — Fidélité`,
    short_name: PRODUCT_NAME,
    start_url: "/kiosque",
    display: "fullscreen",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
