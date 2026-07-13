import type { MetadataRoute } from "next";

/**
 * PWA manifest. Next.js serves this at `/manifest.webmanifest` and wires
 * it through the `manifest` field of the root metadata export.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XLS-66 and XLS-65 Lending Protocol · XRPL Reference App",
    short_name: "XLS-66 and XLS-65 Lending",
    description:
      "Open-source demo application implementing the XRP Ledger lending amendments (XLS-66 + XLS-65) on Devnet.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["finance", "developer"],
  };
}
