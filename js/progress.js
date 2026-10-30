/* FFmpeg progress mapping — pure, no DOM. FFmpeg.wasm reports
   progress time in microseconds; this maps it onto the video
   duration as a 0–100 percentage, clamped so a noisy final event
   can never push the bar past 100. */

export function progressPercent(timeMicroseconds, durationSec) {
  if (!Number.isFinite(timeMicroseconds) || timeMicroseconds < 0) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const pct = (timeMicroseconds / 1000000 / durationSec) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}
