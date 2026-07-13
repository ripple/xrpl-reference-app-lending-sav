import { DROPS_PER_XRP } from "@/lib/constants";

interface AmountDisplayProps {
  drops: string;
  className?: string;
  /** If set, display as token amount instead of XRP drops */
  token?: string;
}

export function AmountDisplay({ drops, className, token }: AmountDisplayProps) {
  let display: string;
  let unit: string;

  if (token) {
    // Token amount — the value is already in human-readable form or needs simple formatting
    const num = parseFloat(drops);
    display = isNaN(num) ? "0.00" : num.toFixed(2);
    unit = token;
  } else {
    // XRP — convert from drops
    display = (parseInt(drops) / DROPS_PER_XRP).toFixed(2);
    unit = "XRP";
  }

  return (
    <span className={className}>
      <span className="font-mono font-semibold">{display}</span>
      <span className="ml-1 text-muted-foreground">{unit}</span>
    </span>
  );
}
