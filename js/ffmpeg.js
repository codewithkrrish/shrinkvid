/* FFmpeg.wasm loader — pinned CDN releases, honest failure only.
   Nothing is imported at module top level: the CDN modules are
   fetched lazily inside loadFFmpeg(), so a page with no connection
   still renders, and a failed load is a message, never a hang.
   Single-thread core is used on purpose: Vercel static hosting
   cannot set the COOP/COEP headers the multi-thread core needs,
   so core-mt would fail on the deployed site. */

export const FFMPEG_VERSION = '0.12.15';
export const UTIL_VERSION = '0.12.2';
export const UTIL_FALLBACK_VERSION = '0.12.1';
export const CORE_VERSION = '0.12.6';

export const FFMPEG_ESM_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/+esm`;
export const UTIL_ESM_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/util@${UTIL_VERSION}/+esm`;
export const UTIL_FALLBACK_ESM_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/util@${UTIL_FALLBACK_VERSION}/+esm`;
export const CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
export const CORE_BASE_URL_UNPKG = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
export const FFMPEG_UNPKG_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/esm/index.js`;
export const UTIL_UNPKG_URL = `https://unpkg.com/@ffmpeg/util@${UTIL_VERSION}/esm/index.js`;

const LOAD_TIMEOUT_MS = 120000;

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

async function tryCandidate({ ffmpegUrl, utilUrl, coreBase, onProgress }) {
  const ffmpegModule = await import(ffmpegUrl);
  const utilModule = await import(utilUrl);
  if (typeof ffmpegModule.FFmpeg !== 'function') throw new Error('FFmpeg export missing from the loaded module.');
  if (typeof utilModule.fetchFile !== 'function' || typeof utilModule.toBlobURL !== 'function') {
    throw new Error('FFmpeg util exports missing from the loaded module.');
  }
  const ffmpeg = new ffmpegModule.FFmpeg();
  if (onProgress) ffmpeg.on('progress', onProgress);
  await withTimeout(ffmpeg.load({
    coreURL: await utilModule.toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await utilModule.toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm'),
  }), LOAD_TIMEOUT_MS, 'FFmpeg core download');
  return { ffmpeg, fetchFile: utilModule.fetchFile };
}

let cached = null;

/* Loads the encoder once and reuses it. On failure the cache is
   cleared so a retry is possible, and the thrown error names the
   pinned releases that were tried. */
export async function loadFFmpeg(onProgress) {
  if (cached) return cached;
  const candidates = [
    { label: 'jsDelivr ffmpeg + util', ffmpegUrl: FFMPEG_ESM_URL, utilUrl: UTIL_ESM_URL, coreBase: CORE_BASE_URL },
    { label: 'jsDelivr ffmpeg + util fallback', ffmpegUrl: FFMPEG_ESM_URL, utilUrl: UTIL_FALLBACK_ESM_URL, coreBase: CORE_BASE_URL },
    { label: 'unpkg ffmpeg + util', ffmpegUrl: FFMPEG_UNPKG_URL, utilUrl: UTIL_UNPKG_URL, coreBase: CORE_BASE_URL_UNPKG },
  ];
  const errors = [];
  for (const candidate of candidates) {
    try {
      cached = await tryCandidate({ ...candidate, onProgress });
      return cached;
    } catch (err) {
      errors.push(`${candidate.label}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  cached = null;
  throw new Error(
    `FFmpeg encoder could not be loaded from the pinned CDN releases (@ffmpeg/ffmpeg ${FFMPEG_VERSION}, @ffmpeg/util ${UTIL_VERSION}, @ffmpeg/core ${CORE_VERSION}). ` +
    `Check your connection and try "Load encoder" again. (${errors.join(' | ')})`,
  );
}

export function isFFmpegLoaded() {
  return cached !== null;
}

/* terminate() kills the loaded instance, so a cancelled run must
   drop the cache or the next load would reuse a dead encoder. */
export function clearFFmpegCache() {
  cached = null;
}
