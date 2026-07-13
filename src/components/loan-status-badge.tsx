import { Badge } from "@/components/ui/badge";

const statusConfig = {
  pending: { label: "Pending", variant: "outline" as const },
  active: { label: "Active", variant: "default" as const },
  repaid: { label: "Repaid", variant: "secondary" as const },
  closed: { label: "Closed", variant: "secondary" as const },
  defaulted: { label: "Defaulted", variant: "destructive" as const },
};

export function LoanStatusBadge({
  status,
}: {
  status: string;
}) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
