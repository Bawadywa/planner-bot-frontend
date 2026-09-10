/* Task and comment images are held as data: URLs in localStorage, which has a
   ~5 MB quota for the whole origin - a single untouched phone photo is 3-6 MB
   on its own. So every pick is downscaled and re-encoded before it is stored.

   When images move to the backend this whole file goes away: the file object
   gets posted as multipart and the column holds a key, not the bytes. */

import { t } from "../i18n";

const MAX_EDGE = 1280; // px on the longest side
const QUALITY = 0.72; // JPEG quality
const MAX_BYTES = 700 * 1024; // refuse anything still bigger after re-encoding

export class ImageTooLargeError extends Error {
  constructor() {
    super(t("image.tooLarge"));
    this.name = "ImageTooLargeError";
  }
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t("image.notAnImage")));
    };
    img.src = url;
  });
}

/** Downscale to fit MAX_EDGE, re-encode as JPEG, return a data: URL. */
export async function fileToDataUrl(file: File): Promise<string> {
  const img = await loadBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("image.noCanvas"));
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);

  // base64 carries ~4 chars per 3 bytes, so this is the decoded size.
  const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  if (bytes > MAX_BYTES) throw new ImageTooLargeError();

  return dataUrl;
}
