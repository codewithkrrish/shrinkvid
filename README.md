# ShrinkVid

I kept hitting the same wall: a video that was just a bit too big
to send on WhatsApp, and every compressor I found wanted an upload
first. I did not want my videos sitting on someone else's server
just to make them smaller, so I built the version I wanted — pick
a target size, see the exact bitrate the page plans to use, and let
the browser do the encoding itself. Nothing leaves your device.

## What it does

- Video upload three ways: drag and drop, the file picker, or
  pasting a copied video file into the page. MP4 and WebM work best.
- A queue of up to 3 videos, compressed one at a time in order,
  each with its own download. The preview player shows the selected
  video with its duration, dimensions and original size.
- Target-size presets: 16 MB (WhatsApp), 25 MB, 64 MB, plus a custom
  size input. Resolution choices: Original, 1080p, 720p, 480p, 360p.
  Quality/speed presets (Faster / Balanced / Smaller) map to x264
  presets (veryfast / medium / slow) at the same target bitrate.
- Before you compress, the page shows the full plan: target size,
  output resolution, estimated video bitrate and audio bitrate. The
  bitrate is pure arithmetic — target size minus the audio
  allowance, spread over the duration — and it lives in a separate
  module so it can be unit-tested.
- Real FFmpeg progress: the progress bar follows FFmpeg.wasm
  progress events, with elapsed time and a Cancel button. Cancelling
  stops the encoder and the page tells you to load it again.
- Results are honest: a preview player, before/after sizes in bytes
  and percent, the size reduction, and a plain verdict when the
  result misses the target or comes out larger than the original.
  Output is MP4 (H.264 + AAC) and keeps your filename with
  "-compressed" added, so the original is never overwritten.
- Keyboard shortcuts: C compresses, Esc cancels. They stay quiet
  while you are typing in a field.
- A "How it works" strip and plain-language notes on the page about
  speed, memory, target variance and codec support.

## How the encoding works

FFmpeg.wasm 0.12.15 with @ffmpeg/util
0.12.2 and @ffmpeg/core 0.12.6, single-thread core. The
@ffmpeg/ffmpeg 0.12.15 ESM files (MIT) are vendored in
vendor/ffmpeg-esm/ rather than loaded from a CDN, because browsers
refuse a cross-origin worker script and the encoder's worker must
be same-origin. The
single-thread core is deliberate: the multi-thread core needs
cross-origin isolation headers that a static host cannot set, so
it would fail on the deployed site. If the CDN modules cannot
load, compression fails with a named message instead of hanging;
a jsDelivr util fallback (0.12.1) and an unpkg fallback are tried
in order before giving up.

## Honest limitations

- The first run downloads about 30 MB of FFmpeg core. After that
  the browser caches it, but with no connection there is no
  compression at all — there is no server fallback, by design.
- Speed depends on your device, and it runs on one browser thread.
  A short phone clip finishes in seconds; a long 4K video can take
  many minutes. Keep the tab open while it runs.
- Target size is a target, not a promise. x264 aims at the bitrate
  on average, so busy scenes can overshoot and already-compressed
  sources can come out larger. The result panel says so plainly.
- Very large files can run out of browser memory, because the whole
  video is held in memory during encoding. Split long clips first
  if a huge file fails.
- Whether a video decodes at all depends on your browser's codecs,
  not on this page. MP4 and WebM cover nearly everything, but an
  unusual codec may load without playing; another browser or a
  re-export as MP4 usually fixes it.

## Run it locally

No build step, no dependencies to install — it is plain HTML, CSS
and JavaScript modules. Serve the folder over HTTP (ES modules do
not run from `file://` in most browsers) and open it:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000. The FFmpeg modules still load
from the CDN, so you need a connection for compression itself.

## License

MIT — see LICENSE.
