/* Size, time and filename formatting — pure, no DOM. */

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatPercent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 'n/a';
  return `${Math.round((part / whole) * 100)}%`;
}

/* Reduction of the result vs the original: positive = smaller. */
export function reductionPercent(originalBytes, resultBytes) {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0 || !Number.isFinite(resultBytes)) return null;
  return Math.round(((originalBytes - resultBytes) / originalBytes) * 100);
}

export function compareSizes(originalBytes, resultBytes) {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0 || !Number.isFinite(resultBytes) || resultBytes < 0) {
    return 'Size comparison unavailable.';
  }
  const pct = formatPercent(resultBytes, originalBytes);
  if (resultBytes < originalBytes) {
    return `Compressed file is ${pct} of the original.`;
  }
  if (resultBytes > originalBytes) {
    return `Compressed file is larger than the original (${pct}) — the target bitrate was too high for this clip, or the original was already tightly compressed. Try a smaller target size.`;
  }
  return 'Compressed file is the same size as the original.';
}

/* Honest target verdict: within 10% counts as "hit", over target
   is reported plainly, never hidden. */
export function targetVerdict(resultBytes, targetMB) {
  if (!Number.isFinite(resultBytes) || !Number.isFinite(targetMB) || targetMB <= 0) return '';
  const targetBytes = targetMB * 1024 * 1024;
  if (resultBytes <= targetBytes) return `Under the ${targetMB} MB target.`;
  if (resultBytes <= targetBytes * 1.1) return `Close to the ${targetMB} MB target (within 10%).`;
  return `Over the ${targetMB} MB target — re-encode bitrate varies by scene, so busy footage can overshoot. Try a smaller target or a lower resolution.`;
}

/* "my clip.mp4" -> "my clip-compressed.mp4"; no extension -> suffix only. */
export function outputFilename(originalName) {
  const name = String(originalName || 'video');
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)}-compressed.mp4`;
  return `${name}-compressed.mp4`;
}

export function inputFilename(originalName) {
  const name = String(originalName || 'video');
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `input${name.slice(dot).toLowerCase()}`;
  return 'input.mp4';
}

/* Elapsed timer: 0 -> "0:00", 65 -> "1:05", 600 -> "10:00". */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatDurationSec(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown length';
  return `${seconds.toFixed(1)}s`;
}
