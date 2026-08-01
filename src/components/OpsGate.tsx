"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  checkOpsAccess,
  type OpsPermission,
} from "@/lib/accounting/access";

type Props = {
  children: ReactNode;
  permission: OpsPermission;
  /** Shown on the pending page if access is denied */
  section: string;
};

/**
 * Blocks ops pages unless Admin has granted pubOps / forestryOps
 * to the restored, approved user. Others are sent to the teaser pending page.
 */
export default function OpsGate({ children, permission, section }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkOpsAccess(permission);
      if (cancelled) return;
      if (!ok) {
        router.replace(
          `/accounting/pending?module=${encodeURIComponent(section)}&back=${encodeURIComponent("/")}`
        );
        setAllowed(false);
        return;
      }
      setAllowed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, permission, section]);

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
        Checking operations access…
      </main>
    );
  }

  return <>{children}</>;
}
