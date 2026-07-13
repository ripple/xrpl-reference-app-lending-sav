"use client";

import { Separator } from "@/components/ui/separator";

const links: { label: string; href: string }[] = [
  { label: "XRPL", href: "https://xrpl.org/" },
  {
    label: "XLS-66 Docs",
    href: "https://xrpl.org/docs/concepts/tokens/lending-protocol",
  },
  {
    label: "XLS-65 Docs",
    href: "https://xrpl.org/docs/concepts/tokens/single-asset-vaults",
  },
];

export function Footer() {
  return (
    <footer className="py-8 mt-auto">
      <Separator className="mb-8" />
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="flex flex-col items-center gap-4">
          <nav className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2">
            {links.map((link, index) => (
              <a
                key={index}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground/60">
            Template — built on the XRP Ledger.
          </p>
        </div>
      </div>
    </footer>
  );
}
