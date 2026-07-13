"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { explorerAccountUrl } from "@/lib/explorer";

export function WalletBadge({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Badge
        variant="outline"
        className="cursor-pointer gap-1.5 font-mono text-xs"
        onClick={handleCopy}
      >
        {truncated}
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </Badge>
      <a
        href={explorerAccountUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-primary transition-colors"
        title="View on XRPL Explorer"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}
