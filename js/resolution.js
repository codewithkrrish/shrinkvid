/* Resolution scaling — pure, no DOM. Aspect-preserving, never
   upscales, and always lands on even dimensions (x264 with
   yuv420p requires even width and height). */

export const RESOLUTION_OPTIONS = [
  { id: 'original', label: 'Original', targetWidth: null },
  { id: '1080', label: '1080p', targetWidth: 1920 },
  { id: '720', label: '720p', targetWidth: 1280 },
  { id: '480', label: '480p', targetWidth: 854 },
  { id: '360', label: '360p', targetWidth: 640 },
];

export function resolutionLabel(resolutionId) {
  const found = RESOLUTION_OPTIONS.find((r) => r.id === resolutionId);
  return found ? found.label : 'Original';
}

export function makeEven(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

/* Returns { width, height } for the output, or { width: 0, height: 0 }
   when the source dimensions are unknown (caller then omits the
   scale filter and lets FFmpeg keep the source size). */
export function scaleDimensions(origWidth, origHeight, resolutionId) {
  if (!Number.isFinite(origWidth) || !Number.isFinite(origHeight) || origWidth <= 0 || origHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const option = RESOLUTION_OPTIONS.find((r) => r.id === resolutionId) || RESOLUTION_OPTIONS[0];
  const evenW = makeEven(origWidth);
  const evenH = makeEven(origHeight);
  if (option.targetWidth === null || origWidth <= option.targetWidth) {
    return { width: evenW, height: evenH };
  }
  const width = option.targetWidth;
  const height = makeEven((origHeight * width) / origWidth);
  return { width, height };
}
