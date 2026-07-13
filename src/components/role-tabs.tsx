"use client";

import { usePathname, useRouter } from "next/navigation";
import { Briefcase, PiggyBank, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";

const roles = [
  { value: "broker", label: "Loan Broker", icon: Briefcase, href: "/dashboard/broker" },
  { value: "depositor", label: "Depositor", icon: PiggyBank, href: "/dashboard/depositor" },
  { value: "borrower", label: "Borrower", icon: HandCoins, href: "/dashboard/borrower" },
] as const;

export function RoleTabs() {
  const pathname = usePathname();
  const router = useRouter();

  const activeRole = roles.find((r) => pathname.startsWith(r.href))?.value || "broker";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Select role</span>
      <div className="flex gap-1">
        {roles.map((role) => {
          const isActive = activeRole === role.value;
          return (
            <button
              key={role.value}
              onClick={() => router.push(role.href)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <role.icon className="h-4 w-4" />
              <span>{role.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
