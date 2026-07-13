"use client";

import { SessionContext, useSessionProvider } from "@/hooks/use-session";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const value = useSessionProvider();
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
