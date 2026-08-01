"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkAccountingAccess } from "@/lib/accounting/access";

type Props = {
  children: ReactNode;
  /** Shown on the pending page if access is denied */
  section?: string;
  /** In-app back target (not browser history) */
  backHref?: string;
  backLabel?: string;
};

/**
 * Blocks accounting pages unless Admin has granted permissions.accounting
 * to the restored, approved user. Others are sent to the teaser pending page.
 * Always shows a dedicated Back link so navigation does not rely on the browser.
 */
export default function AccountingGate({
  children,
  section = "Accounting",
  backHref = "/accounting",
  backLabel = "← Back to Accounting",
}: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkAccountingAccess();
      if (cancelled) return;
      if (!ok) {
        router.replace(
          `/accounting/pending?module=${encodeURIComponent("Accounting")}&section=${encodeURIComponent(section)}`
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex flex-wrap items-center gap-4">
          <Link
            href={backHref}
            className="inline-flex items-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium px-4 py-2 text-sm"
          >
            {backLabel}
          </Link>
          {backHref !== "/accounting" ? (
            <Link
              href="/accounting"
              className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
            >
              Accounting hub
            </Link>
          ) : (
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
            >
              Alerts home
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
