import { PRODUCT_NAME } from "@/config/product";

/** Manifest de l'appli du commerçant (installable sur l'écran d'accueil du téléphone). */
export function GET() {
  return Response.json(
    {
      name: `${PRODUCT_NAME} — Mon commerce`,
      short_name: PRODUCT_NAME,
      start_url: "/app",
      scope: "/app",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f6f6f4",
      theme_color: "#f6f6f4",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
