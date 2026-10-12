/**
 * Photo type detection by content (never by the name or header the client
 * sends) and removal of hidden metadata: GPS position, phone model, time,
 * comments. Only metadata blocks are dropped; the image data itself is
 * copied byte for byte, so the picture is unchanged. One pass, O(n).
 */

export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

export const EXTENSIONS: Readonly<Record<PhotoType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectType(data: Buffer): PhotoType | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'image/png';
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export class MalformedImageError extends Error {}

/** The same image without metadata. Throws MalformedImageError if the structure is broken. */
export function stripMetadata(data: Buffer, type: PhotoType): Buffer {
  switch (type) {
    case 'image/jpeg':
      return stripJpeg(data);
    case 'image/png':
      return stripPng(data);
    case 'image/webp':
      return stripWebp(data);
  }
}

// --- JPEG: segments until Start of Scan, then the compressed data verbatim ---

/** APP1 (Exif, XMP), APP13 (IPTC) and COM (comments) carry metadata. ICC colour (APP2) stays. */
const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]);

function stripJpeg(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 2)]; // SOI
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff)
      throw new MalformedImageError('Expected a JPEG marker');
    while (data[i] === 0xff && i < data.length) i++; // fill bytes
    const marker = data[i];
    const start = i - 1;
    i++;
    if (marker === 0xd9) {
      parts.push(data.subarray(start, i));
      return Buffer.concat(parts);
    }
    if (i + 2 > data.length)
      throw new MalformedImageError('Truncated JPEG segment');
    const length = data.readUInt16BE(i);
    if (length < 2 || i + length > data.length) {
      throw new MalformedImageError('Bad JPEG segment length');
    }
    const end = i + length;
    if (marker === 0xda) {
      // Start of Scan: everything from here is image data.
      parts.push(data.subarray(start));
      return Buffer.concat(parts);
    }
    if (!JPEG_DROP.has(marker)) parts.push(data.subarray(start, end));
    i = end;
  }
  throw new MalformedImageError('JPEG ended without image data');
}

// --- PNG: chunks; text, time and Exif chunks are metadata ---

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 8)];
  let i = 8;
  while (i < data.length) {
    if (i + 12 > data.length)
      throw new MalformedImageError('Truncated PNG chunk');
    const length = data.readUInt32BE(i);
    const type = data.toString('latin1', i + 4, i + 8);
    const end = i + 12 + length;
    if (end > data.length)
      throw new MalformedImageError('Bad PNG chunk length');
    if (!PNG_DROP.has(type)) parts.push(data.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  throw new MalformedImageError('PNG ended without IEND');
}

// --- WebP: RIFF chunks; EXIF and XMP chunks are metadata ---

const WEBP_DROP = new Set(['EXIF', 'XMP ']);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(data: Buffer): Buffer {
  const riffEnd = 8 + data.readUInt32LE(4);
  if (riffEnd > data.length) throw new MalformedImageError('Bad WebP size');
  const chunks: Buffer[] = [];
  let i = 12;
  while (i < riffEnd) {
    if (i + 8 > riffEnd) throw new MalformedImageError('Truncated WebP chunk');
    const type = data.toString('latin1', i, i + 4);
    const size = data.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2); // chunks are padded to even sizes
    if (end > riffEnd) throw new MalformedImageError('Bad WebP chunk size');
    if (!WEBP_DROP.has(type)) {
      const chunk = Buffer.from(data.subarray(i, end));
      if (type === 'VP8X') chunk[8] &= ~(VP8X_EXIF | VP8X_XMP); // flags no longer true
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}
