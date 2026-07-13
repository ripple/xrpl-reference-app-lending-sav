"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { RepaymentForm } from "./repayment";
import { LoanHistory } from "./loan-history";
import { TransactionStatus } from "@/components/transaction-status";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, HandCoins } from "lucide-react";
import type { LoanState } from "@/types/loan";

export default function BorrowerPage() {
  const { session } = useSession();
  const [loans, setLoans] = useState<LoanState[]>([]);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "pending";
    message: string;
    txHash?: string;
  } | null>(null);

  const fetchLoans = useCallback(async () => {
    if (!session) return;
    const res = await fetch("/api/loan");
    if (res.ok) {
      const data = await res.json();
      setLoans(data.loans);
    }
  }, [session]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  if (!session) return null;

  const activeLoans = loans.filter((l) => l.status === "active");
  const pastLoans = loans.filter((l) => l.status !== "active");

  // No vault yet
  if (!session.vaultId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-dashed">
          <CardHeader className="text-center py-16">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <HandCoins className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl">No Vault or Broker Yet</CardTitle>
            <CardDescription className="flex items-center justify-center gap-1 mt-2 text-sm">
              Switch to the{" "}
              <span className="font-medium text-foreground">Loan Broker</span>{" "}
              tab
              <ArrowRight className="h-3 w-3" />
              create a vault and register as broker first.
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  // Past the no-vault guard above, so vaultId is defined. Loans link to their
  // associated vault on the explorer (there is no direct loan-object page).
  const vaultId = session.vaultId;

  // Vault exists but no loans
  if (loans.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-dashed">
          <CardHeader className="text-center py-16">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <HandCoins className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl">No Loans Yet</CardTitle>
            <CardDescription className="mt-2 text-sm max-w-md mx-auto">
              The broker needs to issue a loan first. Switch to the{" "}
              <span className="font-medium text-foreground">Loan Broker</span>{" "}
              tab, then deposit liquidity via the{" "}
              <span className="font-medium text-foreground">Depositor</span>{" "}
              tab, and finally issue a loan.
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Borrower</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your active loans and make repayments.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {status && (
          <motion.div
            key="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <TransactionStatus status={status.type} message={status.message} txHash={status.txHash} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active loans */}
      {activeLoans.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {activeLoans.map((loan, i) => (
            <motion.div
              key={loan.loanId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <RepaymentForm
                loan={loan}
                token={session.issuedToken ? "TUSD" : undefined}
                vaultId={vaultId}
                onSuccess={(msg, txHash) => {
                  fetchLoans();
                  setStatus({ type: "success", message: msg, txHash });
                }}
                onError={(msg) => setStatus({ type: "error", message: msg })}
                onPending={(msg) =>
                  setStatus({ type: "pending", message: msg })
                }
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* History */}
      {pastLoans.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <LoanHistory loans={pastLoans} token={session.issuedToken ? "TUSD" : undefined} vaultId={vaultId} />
        </motion.div>
      )}
    </div>
  );
}
