/**
 * Read GPS from a camera JPEG (or any buffer that embeds an Exif TIFF).
 * Used when the browser cannot get a fix under canopy.
 */

export type JpegGps = {
  latitude: number;
  longitude: number;
};

const EXIF_MARK = Buffer.from("Exif\0\0", "latin1");

type Reader = {
  u16: (offset: number) => number;
  u32: (offset: number) => number;
};

function readerFor(buf: Buffer, start: number): Reader | null {
  const order = buf.toString("latin1", start, start + 2);
  if (order === "II") {
    return {
      u16: (offset) => buf.readUInt16LE(offset),
      u32: (offset) => buf.readUInt32LE(offset),
    };
  }
  if (order === "MM") {
    return {
      u16: (offset) => buf.readUInt16BE(offset),
      u32: (offset) => buf.readUInt32BE(offset),
    };
  }
  return null;
}

function rational(buf: Buffer, offset: number, u32: Reader["u32"]): number | null {
  if (offset < 0 || offset + 8 > buf.length) return null;
  const den = u32(offset + 4);
  if (!den) return null;
  return u32(offset) / den;
}

function dms(
  buf: Buffer,
  offset: number,
  u32: Reader["u32"]
): number | null {
  const deg = rational(buf, offset, u32);
  const min = rational(buf, offset + 8, u32);
  const sec = rational(buf, offset + 16, u32);
  if (deg == null || min == null || sec == null) return null;
  return deg + min / 60 + sec / 3600;
}

function ifdEntry(
  buf: Buffer,
  ifd: number,
  tag: number,
  read: Reader
): { type: number; count: number; value: number; entry: number } | null {
  if (ifd < 0 || ifd + 2 > buf.length) return null;
  const count = read.u16(ifd);
  if (count > 64) return null;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > buf.length) return null;
    if (read.u16(entry) !== tag) continue;
    return {
      type: read.u16(entry + 2),
      count: read.u32(entry + 4),
      value: read.u32(entry + 8),
      entry,
    };
  }
  return null;
}

function asciiRef(buf: Buffer, entry: number): string {
  return buf
    .toString("latin1", entry + 8, entry + 10)
    .replace(/\0/g, "")
    .toUpperCase();
}

function readTiffGps(buf: Buffer, tiffStart: number): JpegGps | null {
  if (tiffStart < 0 || tiffStart + 8 > buf.length) return null;
  const read = readerFor(buf, tiffStart);
  if (!read || read.u16(tiffStart + 2) !== 42) return null;
  const ifd0 = tiffStart + read.u32(tiffStart + 4);
  const pointer = ifdEntry(buf, ifd0, 0x8825, read);
  if (!pointer) return null;
  const gpsIfd = tiffStart + pointer.value;
  const latEntry = ifdEntry(buf, gpsIfd, 0x0002, read);
  const lngEntry = ifdEntry(buf, gpsIfd, 0x0004, read);
  const latRef = ifdEntry(buf, gpsIfd, 0x0001, read);
  const lngRef = ifdEntry(buf, gpsIfd, 0x0003, read);
  if (!latEntry || !lngEntry) return null;
  const latitude = dms(buf, tiffStart + latEntry.value, read.u32);
  const longitude = dms(buf, tiffStart + lngEntry.value, read.u32);
  if (latitude == null || longitude == null) return null;
  const latSign = latRef && asciiRef(buf, latRef.entry) === "S" ? -1 : 1;
  const lngSign = lngRef && asciiRef(buf, lngRef.entry) === "W" ? -1 : 1;
  const lat = Math.round(latSign * latitude * 1e6) / 1e6;
  const lng = Math.round(lngSign * longitude * 1e6) / 1e6;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

/** GPS stored in the photo, or null when the camera did not write one. */
export function readJpegGps(buffer: Buffer): JpegGps | null {
  if (!buffer || buffer.length < 16) return null;
  let from = 0;
  while (from < buffer.length) {
    const idx = buffer.indexOf(EXIF_MARK, from);
    if (idx < 0) return null;
    const gps = readTiffGps(buffer, idx + EXIF_MARK.length);
    if (gps) return gps;
    from = idx + EXIF_MARK.length;
  }
  return null;
}
