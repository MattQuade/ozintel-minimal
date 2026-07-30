"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { checkAccountingAccess } from "@/lib/accounting/access";

type Props = {
  children: ReactNode;
  /** Shown on the pending page if access is denied */
  section?: string;
};

/**
 * Blocks accounting pages unless Admin has granted permissions.accounting
 * to the restored, approved user. Others are sent to the teaser pending page.
 */
export default function AccountingGate({ children, section = "Accounting" }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkAccountingAccess();
      if (cancelled) return;
      if (!ok) {
        router.replace(
          `/accounting/pending?section=${encodeURIComponent(section)}`
        );
        setAllowed(false);
        return;
      }
      setAllowed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, section]);

  if (allowed !== true) {
    return (
      <main
        style={{
          fontFamily: "system-ui",
          background: "#0f172a",
          color: "#94a3b8",
          minHeight: "100vh",
          padding: 24,
          textAlign: "center",
        }}
      >
        Checking accounting access…
      </main>
    );
  }

  return <>{children}</>;
}
