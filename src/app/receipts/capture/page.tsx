'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old capture URL — flow now stays on the home Capture Receipt button. */
export default function CaptureReceiptRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return (
    <div
      style={{
        fontFamily: 'system-ui',
        background: '#0f172a',
        minHeight: '100vh',
      }}
    />
  );
}
