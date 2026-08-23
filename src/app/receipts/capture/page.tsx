import { headers } from "next/headers";
import CaptureReceiptClient from "./CaptureReceiptClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CaptureReceiptPage() {
  await headers();
  return <CaptureReceiptClient />;
}
