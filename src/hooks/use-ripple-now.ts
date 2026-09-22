"use client";

import { useEffect, useState } from "react";
import { nowRippleSeconds } from "@/lib/constants";

/**
 * Wall clock in Ripple-epoch seconds, re-read on an interval so phase
 * badges and countdowns tick without a refetch. The ledger close time is the
 * authority for gating; this only drives what the UI shows.
 */
export function useRippleNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => nowRippleSeconds());
  useEffect(() => {
    const id = setInterval(() => setNow(nowRippleSeconds()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
