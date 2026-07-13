"use client";

import { AlertCircle, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { explorerTransactionUrl } from "@/lib/explorer";

type Status = "success" | "error" | "pending";

const config = {
  success: {
    icon: CheckCircle2,
    className: "border-success/50 bg-success/5 text-success",
  },
  error: {
    icon: AlertCircle,
    className: "border-destructive/50 bg-destructive/5 text-destructive",
  },
  pending: {
    icon: Loader2,
    className: "border-primary/50 bg-primary/5 text-primary",
  },
};

export function TransactionStatus({
  status,
  message,
  txHash,
}: {
  status: Status;
  message: string;
  txHash?: string;
}) {
  const { icon: Icon, className } = config[status];

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${className}`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${status === "pending" ? "animate-spin" : ""}`}
      />
      <span className="flex-1">{message}</span>
      {txHash && (
        <a
          href={explorerTransactionUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:opacity-80 transition-opacity shrink-0"
        >
          View tx
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
