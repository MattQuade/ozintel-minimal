import { headers } from "next/headers";
import AccountingHubClient from "./AccountingHubClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountingHubPage() {
  await headers();
  return <AccountingHubClient />;
}
