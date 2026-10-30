/* Target-size bitrate math — pure, no DOM.
   Convention: "MB" here means MiB (1024 x 1024 bytes), the unit
   browsers and file managers report for a file of that size. The
   video bitrate is whatever is left after the audio allowance:
   total bits for the target size, minus audio bits, spread over
   the duration. It is a target, not a guarantee: x264 honours
   the bitrate on average, so a finished file can land a little
   above or below the target, and the result panel says so. */

export const TARGET_PRESETS = [
  { id: '16', label: '16 MB — WhatsApp', mb: 16 },
  { id: '25', label: '25 MB', mb: 25 },
  { id: '64', label: '64 MB', mb: 64 },
  { id: 'custom', label: 'Custom size', mb: null },
];

export const DEFAULT_AUDIO_KBPS = 128;
export const MIN_VIDEO_KBPS = 100;
export const MAX_VIDEO_KBPS = 20000;

/* Quality/speed presets: the x264 preset controls how hard the
   encoder works at the same bitrate. Slower presets squeeze more
   quality (or a smaller file) out of the same bits, at the cost of
   time. The bitrate target stays the boss; the preset never
   overrides it, so "Smaller" here means "work harder per bit",
   not "ignore the target". */
export const QUALITY_PRESETS = {
  faster: { id: 'faster', label: 'Faster', x264Preset: 'veryfast', note: 'Quick encode, larger file for the same quality.' },
  balanced: { id: 'balanced', label: 'Balanced', x264Preset: 'medium', note: 'Good balance of speed and compression.' },
  smaller: { id: 'smaller', label: 'Smaller', x264Preset: 'slow', note: 'Slowest encode, best compression at the same bitrate.' },
};

export function clampTargetMB(mb) {
  if (!Number.isFinite(mb)) return 16;
  return Math.min(1024, Math.max(1, Math.round(mb)));
}

export function presetMB(presetId, customMB) {
  if (presetId === 'custom') return clampTargetMB(customMB);
  const found = TARGET_PRESETS.find((p) => p.id === presetId);
  return found && found.mb !== null ? found.mb : 16;
}

export function qualityConfig(qualityId) {
  return QUALITY_PRESETS[qualityId] || QUALITY_PRESETS.balanced;
}

/* Returns the video bitrate in kbps, clamped to a sane range.
   Returns 0 when the duration is unknown or zero (no plan yet). */
export function computeVideoBitrateKbps(targetMB, durationSec, audioKbps) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(targetMB) || targetMB <= 0) return 0;
  const audio = Number.isFinite(audioKbps) && audioKbps > 0 ? audioKbps : 0;
  const totalBits = targetMB * 1024 * 1024 * 8;
  const audioBits = audio * 1000 * durationSec;
  const rawKbps = (totalBits - audioBits) / durationSec / 1000;
  if (rawKbps <= MIN_VIDEO_KBPS) return MIN_VIDEO_KBPS;
  if (rawKbps >= MAX_VIDEO_KBPS) return MAX_VIDEO_KBPS;
  return Math.floor(rawKbps);
}

export function bitrateClampStatus(targetMB, durationSec, audioKbps) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 'none';
  const audio = Number.isFinite(audioKbps) && audioKbps > 0 ? audioKbps : 0;
  const rawKbps = (targetMB * 1024 * 1024 * 8 - audio * 1000 * durationSec) / durationSec / 1000;
  if (rawKbps <= MIN_VIDEO_KBPS) return 'low';
  if (rawKbps >= MAX_VIDEO_KBPS) return 'high';
  return 'none';
}

/* Full plan for one video, or null when it cannot be planned yet. */
export function planSettings({ targetMB, durationSec, audioKbps, outWidth, outHeight }) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const videoKbps = computeVideoBitrateKbps(targetMB, durationSec, audioKbps);
  if (videoKbps <= 0) return null;
  return {
    targetMB: clampTargetMB(targetMB),
    durationSec,
    audioKbps: Number.isFinite(audioKbps) && audioKbps > 0 ? audioKbps : 0,
    videoKbps,
    clamp: bitrateClampStatus(targetMB, durationSec, audioKbps),
    outWidth: outWidth || 0,
    outHeight: outHeight || 0,
  };
}

export function formatPlanLine(plan, resolutionLabel) {
  if (!plan) return 'Load a video to see the compression plan.';
  const dims = plan.outWidth && plan.outHeight ? ` · Output ${plan.outWidth} x ${plan.outHeight}` : '';
  const audio = plan.audioKbps > 0 ? ` · Audio ${plan.audioKbps} kbps` : ' · No audio (silent output)';
  return `Target ${plan.targetMB} MB · ${resolutionLabel}${dims} · Video bitrate ${plan.videoKbps} kbps${audio}`;
}

/* FFmpeg argument list for one encode. MP4 via libx264 + AAC:
   MP4 is the honest default because WhatsApp, phones and browsers
   all play it; a WebM/VP9 output would sometimes be smaller but
   encodes far slower in wasm and plays in fewer places. maxrate
   is held at the target bitrate and bufsize at twice it, so the
   encoder cannot drift far above target on busy scenes. */
export function buildFfmpegArgs({ inputName, outputName, width, height, videoKbps, audioKbps, x264Preset }) {
  const args = ['-i', inputName];
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    args.push('-vf', `scale=${width}:${height}`);
  }
  args.push('-c:v', 'libx264', '-preset', x264Preset || 'medium');
  args.push('-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`);
  args.push('-pix_fmt', 'yuv420p');
  if (audioKbps > 0) {
    args.push('-c:a', 'aac', '-b:a', `${audioKbps}k`);
  } else {
    args.push('-an');
  }
  args.push('-movflags', '+faststart', outputName);
  return args;
}
