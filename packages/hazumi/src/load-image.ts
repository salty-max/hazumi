import type { ImageSource } from "@hazumi/graphics";

/** Decode an image without tying it to a running Hazumi application. */
export async function loadImage(url: string): Promise<ImageSource> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load image ${JSON.stringify(url)}: ${response.status}`);
  }
  // createImageBitmap decodes off the main thread, so a large image does not
  // stall the first frame.
  return createImageBitmap(await response.blob());
}
