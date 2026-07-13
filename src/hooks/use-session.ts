"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session } from "@/types/session";

interface SessionContextValue {
  session: Session | null;
  initializing: boolean;
  /** True while /api/session/me is in flight on first authenticated load. */
  provisioning: boolean;
  error: string | null;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue>({
  session: null,
  initializing: true,
  provisioning: false,
  error: null,
  logout: () => {},
  refreshSession: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function useSessionProvider(): SessionContextValue {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    // Mark provisioning if the call takes longer than 2s — first-login
    // provisioning runs the testnet faucet 4× and takes ~5–10s.
    const provisioningTimer = setTimeout(() => setProvisioning(true), 2000);
    try {
      const res = await fetch("/api/session/me");
      if (res.status === 401) {
        setSession(null);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
      } else {
        setError(`Failed to load session (HTTP ${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      clearTimeout(provisioningTimer);
      setProvisioning(false);
    }
  }, []);

  useEffect(() => {
    fetchSession().finally(() => setInitializing(false));
  }, [fetchSession]);

  const logout = useCallback(() => {
    // Federated logout: SDK clears the local cookie, then bounces to the
    // Auth0 logout endpoint to clear the IdP session, then back to /.
    window.location.href = "/auth/logout";
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/session/me");
    if (res.status === 401) {
      setSession(null);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setSession(data.session);
    }
  }, []);

  return { session, initializing, provisioning, error, logout, refreshSession };
}
