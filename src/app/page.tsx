"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { DotPattern } from "@/components/ui/dot-pattern";
import { BorderBeam } from "@/components/ui/border-beam";
import { ArrowRight, Briefcase, PiggyBank, HandCoins } from "lucide-react";
import { Footer } from "@/components/footer";
import { APP_NAME } from "@/lib/branding";
import { motion } from "motion/react";

export default function Home() {
  const { initializing, session } = useSession();
  const router = useRouter();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (!initializing && session) {
      router.push("/dashboard");
    }
  }, [initializing, session, router]);

  return (
    <div className="relative flex min-h-screen flex-col bg-background overflow-hidden">
      <DotPattern className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] [mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" />

      {/* Top bar */}
      <header className="relative z-10 container mx-auto px-6 pt-6 max-w-5xl flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">
          {APP_NAME}
        </span>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Devnet
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex-grow container mx-auto px-6 py-12 sm:py-20 max-w-5xl">
        {/* Hero */}
        <div className="mb-16">
          <motion.h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.08] mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Lending & Vaults on the XRP Ledger
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <TextGenerateEffect
              words="Experience the full loan lifecycle on the XRP Ledger — create vaults, pool liquidity, issue uncollateralized loans, and manage repayments."
              className="text-lg sm:text-xl text-muted-foreground font-normal leading-relaxed"
            />
            <p className="mt-3 text-sm text-muted-foreground/70">
              KYC compliance, underwriting, and contracting should happen off-chain before the loan is issued on-ledger.
            </p>
          </motion.div>
        </div>

        {/* Sign-in card + Roles */}
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Sign-in — 2 cols */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-b from-primary/[0.03] to-card shadow-xl shadow-primary/10 ring-1 ring-primary/10">
              <BorderBeam size={200} duration={8} />
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Start Demo</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign in with your email — four wallets will be created and funded on Devnet on first login.
                  </p>
                </div>

                <a href="/auth/login?returnTo=/dashboard" className="block">
                  <ShimmerButton
                    className="w-full h-11 text-sm font-semibold"
                    shimmerColor="hsl(213, 100%, 60%)"
                    shimmerSize="0.1em"
                    background="hsl(213, 100%, 40%)"
                  >
                    <span className="flex items-center gap-2 text-white">
                      Sign in / Sign up
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </ShimmerButton>
                </a>

              </CardContent>
            </Card>
          </motion.div>

          {/* Roles — 3 cols */}
          <div className="lg:col-span-3 flex flex-col gap-3 justify-center">
            {[
              {
                icon: Briefcase,
                title: "Loan Broker",
                description:
                  "Create single-asset vaults and issue uncollateralized loans to borrowers.",
                step: "Step 1",
              },
              {
                icon: PiggyBank,
                title: "Depositor",
                description:
                  "Deposit assets into vaults to provide liquidity and earn yield from loan interest.",
                step: "Step 2",
              },
              {
                icon: HandCoins,
                title: "Borrower",
                description:
                  "Accept loan offers and make periodic repayments with configurable terms.",
                step: "Step 3",
              },
            ].map((role, i) => (
              <motion.div
                key={role.title}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                className="group relative rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <role.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold">{role.title}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {role.step}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {role.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
