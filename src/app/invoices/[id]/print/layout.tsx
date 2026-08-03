import type { ReactNode } from 'react';

/** Blank title so the browser PDF footer does not show "OzIntel Alert System". */
export const metadata = {
  title: {
    absolute: ' ',
  },
};

export default function InvoicePrintLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
