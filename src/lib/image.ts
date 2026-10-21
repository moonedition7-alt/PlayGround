export interface PreparedImage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

const MAX_BYTES = 180 * 1024;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1280;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. Try a JPG, PNG, or WebP.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress the image.'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.has(file.type)) {
    throw new Error('Please choose a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is larger than 15 MB. Please choose a smaller file.');
  }

  const loaded = await loadImage(file);
  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(loaded.width, loaded.height));
    let quality = 0.86;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const width = Math.max(1, Math.round(loaded.width * scale));
      const height = Math.max(1, Math.round(loaded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not process the image.');

      context.fillStyle = '#05040a';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(loaded.source, 0, 0, width, height);

      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) {
        return {
          file: new File([blob], 'source-image.jpg', { type: 'image/jpeg' }),
          previewUrl: URL.createObjectURL(blob),
          width,
          height,
        };
      }

      if (quality > 0.55) {
        quality -= 0.1;
      } else {
        scale *= 0.82;
      }
    }

    if (!blob) throw new Error('Could not compress the image.');
    return {
      file: new File([blob], 'source-image.jpg', { type: 'image/jpeg' }),
      previewUrl: URL.createObjectURL(blob),
      width: Math.round(loaded.width * scale),
      height: Math.round(loaded.height * scale),
    };
  } finally {
    loaded.cleanup();
  }
}
