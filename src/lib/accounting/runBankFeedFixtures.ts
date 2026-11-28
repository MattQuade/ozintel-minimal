import { createHmac } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  ensureBankFeed,
  feedDescription,
  matchFeedBankAccount,
  minorUnitsToAmount,
  redbarkFeedRows,
  receiveBankFeedDelivery,
  saveBankFeedSecret,
  verifyRedbarkSignature,
} from "@/lib/accounting/bankFeed";
import { readImportBatch } from "@/lib/accounting/importBatch";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { writeBankAccounts, writeRules } from "@/lib/accounting/store";

type Check = { name: string; ok: boolean; detail: string };

function check(name: string, ok: boolean, detail: string): Check {
  return { name, ok, detail };
}

function sign(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;
}

const posted = {
  id: "txn-woolies",
  object: "transaction",
  amount: -4550,
  currency: "aud",
  status: "posted",
  description: "Woolworths Sydney",
  account_public_id: "acct_everyday",
  account_name: "Everyday Account",
  local_date: "2026-03-05",
  reference: "REF1",
};

function payload(transactions: unknown[], id = "delivery-1") {
  return JSON.stringify({
    id,
    object: "event",
    type: "transactions.synced",
    data: { new: transactions, updated: [] },
  });
}

async function runDisk(): Promise<Check[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ozintel-feed-"));
  const previous = process.env.OZINTEL_DATA_DIR;
  process.env.OZINTEL_DATA_DIR = dir;
  const checks: Check[] = [];
  try {
    const owner = "feed-test@ozintel.com.au";
    const secret = "rbk_whsec_test_secret";
    const nowMs = Date.parse("2026-03-06T00:00:00Z");
    let token = "";
    await runWithDataOwnerAsync(owner, async () => {
      await writeBankAccounts([
        {
          id: "2020",
          name: "Everyday Account",
          accountNumber: "1234",
          bsb: "012345",
          openingBalance: 0,
          openingAsAt: "2025-07-01",
          type: "Cheque",
        },
      ]);
      await writeRules([]);
      const created = await ensureBankFeed(owner);
      await saveBankFeedSecret(secret);
      token = created.token;
      const body = payload([
        posted,
        { ...posted, id: "txn-pending", status: "pending", amount: -100 },
        {
          ...posted,
          id: "txn-savings",
          amount: 2500,
          description: "Interest",
          account_public_id: "acct_saver",
          account_name: "Progress Saver",
          reference: null,
        },
      ]);
      const timestamp = String(Math.floor(nowMs / 1000));
      const first = await receiveBankFeedDelivery({
        token,
        timestamp,
        signature: sign(secret, timestamp, body),
        deliveryId: "delivery-1",
        rawBody: body,
        nowMs,
      });
      checks.push(
        check(
          "posts the woolworths debit and the savings credit",
          first.status === 200 && first.added === 2 && first.pending === 1,
          JSON.stringify(first)
        )
      );
      const lines = await readImportBatch();
      const woolies = lines.find((line) => line.bankDescription.includes("Woolworths"));
      checks.push(
        check(
          "matches the existing Everyday Account and keeps the debit in dollars",
          woolies?.bankAccountId === "2020" && woolies.amount === -45.5,
          JSON.stringify(woolies)
        )
      );
      const interest = lines.find((line) => line.bankDescription === "Interest");
      checks.push(
        check(
          "opens a bank account when the name is not already there",
          Boolean(interest && interest.bankAccountId.startsWith("feed-")),
          JSON.stringify(interest)
        )
      );
      const again = await receiveBankFeedDelivery({
        token,
        timestamp,
        signature: sign(secret, timestamp, body),
        deliveryId: "delivery-1",
        rawBody: body,
        nowMs,
      });
      checks.push(
        check(
          "a retried delivery does not add the lines again",
          again.status === 200 && again.duplicate === true && again.added === 0,
          JSON.stringify(again)
        )
      );
      const bad = await receiveBankFeedDelivery({
        token,
        timestamp,
        signature: sign("other-secret", timestamp, body),
        deliveryId: "delivery-2",
        rawBody: body,
        nowMs,
      });
      checks.push(check("rejects a bad signature", bad.status === 401, JSON.stringify(bad)));
    });

    await writeFile(
      path.join(dir, "users.json"),
      JSON.stringify({
        users: [
          {
            name: "Feed Test",
            email: owner,
            phone: "",
            status: "approved",
            smsCount: 0,
            smsMonth: "2026-11",
            permissions: {
              accounting: true,
              pubOps: false,
              forestryOps: false,
              logisticsOps: false,
              bottleShop: false,
            },
            shares: { pubOps: [], logisticsOps: [] },
          },
        ],
      })
    );
    const routeBody = payload(
      [
        {
          ...posted,
          id: "txn-route",
          amount: -199,
          description: "Cafe",
          reference: null,
        },
      ],
      "delivery-route"
    );
    const routeTimestamp = String(Math.floor(Date.now() / 1000));
    const { POST } = await import("@/app/api/accounting/bank/feed/[token]/route");
    const response = await POST(
      new Request(`https://ozintel.com.au/api/accounting/bank/feed/${token}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-redbark-timestamp": routeTimestamp,
          "x-redbark-signature": sign(secret, routeTimestamp, routeBody),
          "x-redbark-delivery-id": "delivery-route",
        },
        body: routeBody,
      }),
      { params: Promise.resolve({ token }) }
    );
    const responseBody = await response.json();
    checks.push(
      check(
        "the webhook route files the signed post into the batch",
        response.status === 200 && responseBody.added === 1,
        `${response.status} ${JSON.stringify(responseBody)}`
      )
    );
  } finally {
    if (previous === undefined) delete process.env.OZINTEL_DATA_DIR;
    else process.env.OZINTEL_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
  return checks;
}

async function run(): Promise<Check[]> {
  const checks: Check[] = [];
  const secret = "rbk_whsec_test_secret";
  const raw = payload([posted]);
  const nowMs = Date.parse("2026-03-06T00:00:00Z");
  const timestamp = String(Math.floor(nowMs / 1000));
  const good = verifyRedbarkSignature({
    secret,
    timestamp,
    signature: sign(secret, timestamp, raw),
    rawBody: raw,
    nowMs,
  });
  checks.push(check("accepts a fresh signature", good.ok === true, JSON.stringify(good)));
  const stale = verifyRedbarkSignature({
    secret,
    timestamp: String(Math.floor(nowMs / 1000) - 301),
    signature: sign(secret, String(Math.floor(nowMs / 1000) - 301), raw),
    rawBody: raw,
    nowMs,
  });
  checks.push(
    check(
      "rejects a signature older than five minutes",
      stale.ok === false && stale.reason === "stale",
      JSON.stringify(stale)
    )
  );
  checks.push(
    check("converts cents to dollars", minorUnitsToAmount(-4550, "aud") === -45.5, "")
  );
  const rows = redbarkFeedRows(JSON.parse(raw));
  checks.push(
    check(
      "keeps the reference on the description",
      rows.rows[0]?.description === "Woolworths Sydney REF1",
      rows.rows[0]?.description || ""
    )
  );
  checks.push(
    check(
      "description helper ignores a blank extended line",
      feedDescription({ description: "Woolworths Sydney", extended_description: null }) ===
        "Woolworths Sydney",
      ""
    )
  );
  const choice = matchFeedBankAccount(
    [{ id: "2020", name: "Everyday Account" }],
    {},
    { accountKey: "acct_everyday", accountName: "Everyday Account" }
  );
  checks.push(
    check("matches a bank account by name", choice.bankAccountId === "2020", choice.bankAccountId)
  );
  checks.push(...(await runDisk()));
  return checks;
}

run().then((checks) => {
  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
  }
  if (failed.length) {
    console.error(`${failed.length} failed`);
    process.exit(1);
  }
  console.log(`${checks.length} passed`);
});
