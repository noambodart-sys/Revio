import type { Metadata, Viewport } from "next";
import { PRODUCT_NAME } from "@/config/product";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Mon commerce`,
  manifest: "/app.webmanifest",
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f6f6f4", width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f6f6f4] text-slate-900">{children}</div>;
}
