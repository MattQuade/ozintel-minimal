import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ozintel-pin-"));
  process.env.OZINTEL_DATA_DIR = dir;
  process.env.OZINTEL_PIN_SECRET = "test-pin-secret";

  const { hasAccountingPin, setAccountingPin, verifyAccountingPin } =
    await import("./pinStore");
  const { encodePinUnlock, decodePinUnlock } = await import("./pinCookie");

  const email = "matt@example.com";
  assert.equal(await hasAccountingPin(email), false);
  await setAccountingPin(email, "2468");
  assert.equal(await hasAccountingPin(email), true);
  assert.equal(await verifyAccountingPin(email, "2468"), true);
  assert.equal(await verifyAccountingPin(email, "0000"), false);
  assert.equal(await verifyAccountingPin("MATT@example.com", "2468"), true);

  let threw = false;
  try {
    await setAccountingPin(email, "1111");
  } catch {
    threw = true;
  }
  assert.equal(threw, true);

  const token = encodePinUnlock(email);
  assert.equal(decodePinUnlock(token), email);
  assert.equal(decodePinUnlock("nope"), null);

  await rm(dir, { recursive: true, force: true });
  console.log("pin fixtures ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
