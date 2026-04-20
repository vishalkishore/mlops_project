// maskUtils.ts - Utilities for mask conversion and processing

/**
 * Converts a mask image (data URL) to a 2D array of integers (0-255)
 * This is needed for the /set-masks endpoint
 */
export async function convertMaskImageToArray(
  maskDataUrl: string
): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Create canvas with image dimensions
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Draw image to canvas
      ctx.drawImage(img, 0, 0);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      // Convert to 2D array (using alpha channel or grayscale)
      const maskArray: number[][] = [];

      for (let y = 0; y < canvas.height; y++) {
        const row: number[] = [];
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          // Use grayscale average or alpha channel
          // White = 255 (masked), Black = 0 (not masked)
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const alpha = pixels[index + 3];

          // Calculate grayscale value
          const grayscale = Math.round((r + g + b) / 3);

          // Use alpha if image has transparency, otherwise use grayscale
          const maskValue = alpha < 255 ? alpha : grayscale;

          row.push(maskValue);
        }
        maskArray.push(row);
      }

      resolve(maskArray);
    };

    img.onerror = () => {
      reject(new Error("Failed to load mask image"));
    };

    img.src = maskDataUrl;
  });
}

/**
 * Converts an SVG path with transform to a binary mask array
 * This is used for the simulated blob masks
 */
export function svgPathToMaskArray(
  path: string,
  transform: string,
  width: number,
  height: number,
  clipPathUnit: "userSpaceOnUse" | "objectBoundingBox" = "objectBoundingBox"
): number[][] {
  // Create temporary SVG to render the path
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width.toString());
  svg.setAttribute("height", height.toString());
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";

  const pathElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  pathElement.setAttribute("d", path);
  pathElement.setAttribute("fill", "white");

  if (clipPathUnit === "objectBoundingBox") {
    pathElement.setAttribute(
      "transform",
      `scale(${width}, ${height}) ${transform}`
    );
  } else {
    pathElement.setAttribute("transform", transform);
  }

  svg.appendChild(pathElement);
  document.body.appendChild(svg);

  // Create canvas to rasterize
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    document.body.removeChild(svg);
    throw new Error("Could not get canvas context");
  }

  // Draw SVG to canvas (this is a simplified approach)
  // In production, you might want to use a library like html2canvas or similar
  const svgData = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  document.body.removeChild(svg);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      // Convert to 2D array
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const maskArray: number[][] = [];

      for (let y = 0; y < height; y++) {
        const row: number[] = [];
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          const grayscale = Math.round(
            (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3
          );
          // Binary mask: 1 if white-ish (>128), 0 if black-ish
          row.push(grayscale > 128 ? 1 : 0);
        }
        maskArray.push(row);
      }

      resolve(maskArray);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to render SVG path"));
    };

    img.src = url;
  }) as any;
}

/**
 * Downsamples a mask array to a smaller size (useful for large images)
 * This can reduce API payload size
 */
export function downsampleMask(
  mask: number[][],
  targetWidth: number,
  targetHeight: number
): number[][] {
  const originalHeight = mask.length;
  const originalWidth = mask[0]?.length || 0;

  if (originalWidth === 0 || originalHeight === 0) {
    return [];
  }

  const scaleX = originalWidth / targetWidth;
  const scaleY = originalHeight / targetHeight;

  const downsampled: number[][] = [];

  for (let y = 0; y < targetHeight; y++) {
    const row: number[] = [];
    for (let x = 0; x < targetWidth; x++) {
      // Sample from original position
      const origX = Math.floor(x * scaleX);
      const origY = Math.floor(y * scaleY);
      row.push(mask[origY][origX]);
    }
    downsampled.push(row);
  }

  return downsampled;
}

/**
 * Creates a simple rectangular mask at specified coordinates
 * Useful for testing or simple selections
 */
export function createRectangularMask(
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
  width: number,
  height: number
): number[][] {
  const mask: number[][] = [];

  for (let row = 0; row < imageHeight; row++) {
    const maskRow: number[] = [];
    for (let col = 0; col < imageWidth; col++) {
      // 1 if inside rectangle, 0 otherwise
      const isInside =
        col >= x && col < x + width && row >= y && row < y + height;
      maskRow.push(isInside ? 1 : 0);
    }
    mask.push(maskRow);
  }

  return mask;
}

/**
 * Converts multiple mask arrays to a single combined mask
 * Useful when you want to merge multiple selections
 */
export function combineMasks(masks: number[][][]): number[][] {
  if (masks.length === 0) return [];

  const height = masks[0].length;
  const width = masks[0][0]?.length || 0;

  const combined: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      // Any mask that has 1 at this position results in 1
      let value = 0;
      for (const mask of masks) {
        if (mask[y]?.[x]) {
          value = 1;
          break;
        }
      }
      row.push(value);
    }
    combined.push(row);
  }

  return combined;
}
