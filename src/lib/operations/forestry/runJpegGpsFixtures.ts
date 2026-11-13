/**
 * GPS-in-photo fixtures.
 * Run: npx tsx src/lib/operations/forestry/runJpegGpsFixtures.ts
 */

import { readJpegGps } from "@/lib/operations/forestry/jpegGps";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, got: unknown, want: unknown): Check {
  const ok = got === want;
  return { name, ok, detail: ok ? String(got) : `got ${got} want ${want}` };
}

/** Little-endian Exif: 33°30'0" S, 151°15'0" E → -33.5, 151.25 */
function sampleSouthEast(): Buffer {
  const buf = Buffer.alloc(160);
  buf.write("Exif\0\0", 4, "latin1");
  const t = 10;
  buf.write("II", t, "latin1");
  buf.writeUInt16LE(42, t + 2);
  buf.writeUInt32LE(8, t + 4);
  const ifd0 = t + 8;
  buf.writeUInt16LE(1, ifd0);
  buf.writeUInt16LE(0x8825, ifd0 + 2);
  buf.writeUInt16LE(4, ifd0 + 4);
  buf.writeUInt32LE(1, ifd0 + 6);
  buf.writeUInt32LE(26, ifd0 + 10);
  const gps = t + 26;
  buf.writeUInt16LE(4, gps);
  const writeEntry = (
    index: number,
    tag: number,
    type: number,
    count: number,
    value: number
  ) => {
    const e = gps + 2 + index * 12;
    buf.writeUInt16LE(tag, e);
    buf.writeUInt16LE(type, e + 2);
    buf.writeUInt32LE(count, e + 4);
    buf.writeUInt32LE(value, e + 8);
  };
  writeEntry(0, 1, 2, 2, 0x00000053);
  writeEntry(1, 2, 5, 3, 80);
  writeEntry(2, 3, 2, 2, 0x00000045);
  writeEntry(3, 4, 5, 3, 104);
  const rats = t + 80;
  const pairs = [33, 1, 30, 1, 0, 1, 151, 1, 15, 1, 0, 1];
  pairs.forEach((n, i) => buf.writeUInt32LE(n, rats + i * 4));
  return buf;
}

function run(): Check[] {
  const gps = readJpegGps(sampleSouthEast());
  const checks: Check[] = [
    eq("south latitude", gps?.latitude, -33.5),
    eq("east longitude", gps?.longitude, 151.25),
    eq("empty", readJpegGps(Buffer.from("not a photo")), null),
    eq("short", readJpegGps(Buffer.alloc(4)), null),
  ];
  return checks;
}

const checks = run();
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? "OK" : "FAIL"}  ${c.name}: ${c.detail}`);
}
console.log(failed ? `\n${failed} failed` : `\nAll ${checks.length} passed`);
process.exit(failed ? 1 : 0);
