/** Longest side kept: clear enough to judge a crop, small to send on mobile data. */
export const MAX_SIDE = 1600;
const QUALITY = 0.82;

/** The scale that fits `width` × `height` within MAX_SIDE (never enlarges). */
export const fitScale = (width: number, height: number) =>
  Math.min(1, MAX_SIDE / Math.max(width, height, 1));

/**
 * A camera photo made smaller on the phone (a JPEG, its longest side at
 * most 1600 px, turned upright). The original is kept if the browser
 * cannot redraw it; the server checks and cleans whatever arrives.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    const scale = fitScale(bitmap.width, bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
