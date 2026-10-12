import { toString } from 'qrcode';

/**
 * A print-ready SVG QR code. Medium error correction survives smudged or
 * scratched labels; the quiet zone is the standard minimum.
 */
export function qrSvg(text: string): Promise<string> {
  return toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 });
}
