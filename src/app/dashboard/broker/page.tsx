"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { CreateVault } from "./create-vault";
import { VaultDetails } from "./vault-details";
import { IssueLoan } from "./issue-loan";
import { FirstLossCapital } from "./first-loss-capital";
import { ManageLoans } from "./manage-loans";
import { TransactionStatus } from "@/components/transaction-status";
import { StepIndicator } from "@/components/step-indicator";
import { motion, AnimatePresence } from "motion/react";
import { Info } from "lucide-react";
import type { LoanState } from "@/types/loan";

const steps = [
  { label: "Create Vault" },
  { label: "Issue Loan" },
  { label: "Manage" },
];

function SingleVaultNotice() {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="space-y-1.5 text-muted-foreground leading-relaxed">
        <p className="font-medium text-foreground">Single-vault demo</p>
        <p>
          This demo manages one vault at a time per session. To deploy a
          new vault you must first delete the existing one.
        </p>
        <p>
          A vault can only be deleted once{" "}
          <strong className="text-foreground">all associated loans are closed</strong>{" "}
          (repaid or defaulted) <strong className="text-foreground">and depositors have withdrawn</strong>{" "}
          their funds.
        </p>
      </div>
    </div>
  );
}

export default function BrokerPage() {
  const { session, refreshSession } = useSession();
  const [vaultId, setVaultId] = useState<string | null>(
    session?.vaultId || null
  );
  const [loanBrokerId, setLoanBrokerId] = useState<string | null>(
    session?.loanBrokerId || null
  );
  const [loans, setLoans] = useState<LoanState[]>([]);
  const [vaultAssetTotal, setVaultAssetTotal] = useState<string | undefined>(undefined);
  const [vaultAssetsMaximum, setVaultAssetsMaximum] = useState<string | undefined>(undefined);
  const [brokerDebtMaximum, setBrokerDebtMaximum] = useState<string | undefined>(undefined);
  const [brokerDebtTotal, setBrokerDebtTotal] = useState<string | undefined>(undefined);
  const [brokerCoverAvailable, setBrokerCoverAvailable] = useState<string | undefined>(undefined);
  const [brokerCoverRateMinimum, setBrokerCoverRateMinimum] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "pending";
    message: string;
    txHash?: string;
  } | null>(null);

  const fetchVaultInfo = useCallback(async () => {
    if (!vaultId) return;
    try {
      const res = await fetch(`/api/vault/${vaultId}`);
      if (res.ok) {
        const data = await res.json();
        const v = data.onLedger?.vault;
        setVaultAssetTotal(v?.AssetsTotal || "0");
        setVaultAssetsMaximum(v?.AssetsMaximum);
      }
      // Fetch broker node (cover, debt limits, rates) — the LoanBroker id is
      // not a LoanModel row, so /api/loan/[id] 404s; use the broker endpoint.
      if (loanBrokerId) {
        const bRes = await fetch("/api/broker");
        if (bRes.ok) {
          const bData = await bRes.json();
          const node = bData.node;
          if (node) {
            setBrokerDebtMaximum(String(node.DebtMaximum ?? 0));
            setBrokerDebtTotal(String(node.DebtTotal ?? 0));
            setBrokerCoverAvailable(String(node.CoverAvailable ?? 0));
            setBrokerCoverRateMinimum(String(node.CoverRateMinimum ?? 0));
          }
        }
      }
    } catch { /* ignore */ }
  }, [vaultId, loanBrokerId]);

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
    fetchVaultInfo();
  }, [fetchLoans, fetchVaultInfo]);

  useEffect(() => {
    if (session?.vaultId) setVaultId(session.vaultId);
    if (session?.loanBrokerId) setLoanBrokerId(session.loanBrokerId);
  }, [session]);

  if (!session) return null;

  let currentStep = 0;
  if (vaultId && loanBrokerId) currentStep = 1;
  if (loans.length > 0) currentStep = 2;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Loan Broker</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create a vault, register as broker, and issue loans.
          </p>
        </div>
        <StepIndicator steps={steps} currentStep={currentStep} />
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

      {!vaultId ? (
        <motion.div
          key="create"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <SingleVaultNotice />

          <CreateVault
            onCreated={async (id, brokerId, txHash) => {
              setVaultId(id);
              setLoanBrokerId(brokerId);
              await refreshSession(); // Refresh to pick up issuedToken
              setStatus({
                type: "success",
                message: "Vault and broker created on XRPL",
                txHash,
              });
            }}
            onError={(msg) => setStatus({ type: "error", message: msg })}
            onPending={(msg) => setStatus({ type: "pending", message: msg })}
          />
        </motion.div>
      ) : (
        <div className="space-y-8">
          <SingleVaultNotice />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <VaultDetails
              vaultId={vaultId}
              loanBrokerId={loanBrokerId}
              onDeleted={(txHash) => {
                setVaultId(null);
                setLoanBrokerId(null);
                setLoans([]);
                setStatus({ type: "success", message: "Vault deleted", txHash });
              }}
            />
          </motion.div>

          {loanBrokerId && (
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <IssueLoan
                  vaultAssetTotal={vaultAssetTotal}
                  vaultAssetsMaximum={vaultAssetsMaximum}
                  issuedToken={session.issuedToken}
                  brokerDebtMaximum={brokerDebtMaximum}
                  brokerDebtTotal={brokerDebtTotal}
                  brokerCoverAvailable={brokerCoverAvailable}
                  brokerCoverRateMinimum={brokerCoverRateMinimum}
                  onCreated={(txHash) => {
                    fetchLoans();
                    fetchVaultInfo();
                    setStatus({
                      type: "success",
                      message: "Loan issued successfully",
                      txHash,
                    });
                  }}
                  onError={(msg) => setStatus({ type: "error", message: msg })}
                  onPending={(msg) =>
                    setStatus({ type: "pending", message: msg })
                  }
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <FirstLossCapital
                  coverAvailable={brokerCoverAvailable}
                  coverRateMinimum={brokerCoverRateMinimum}
                  token={session.issuedToken ? "TUSD" : undefined}
                  onUpdate={fetchVaultInfo}
                  onStatus={(type, message, txHash) =>
                    setStatus({ type, message, txHash })
                  }
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <ManageLoans
                  loans={loans}
                  token={session.issuedToken ? "TUSD" : undefined}
                  vaultId={vaultId}
                  onUpdate={fetchLoans}
                  onStatus={(type, message, txHash) =>
                    setStatus({ type, message, txHash })
                  }
                />
              </motion.div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
