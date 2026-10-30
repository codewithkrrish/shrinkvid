/* ShrinkVid — DOM wiring. All maths lives in the pure modules;
   this file only moves files, settings and results around the page. */
import { TARGET_PRESETS, QUALITY_PRESETS, DEFAULT_AUDIO_KBPS, presetMB, qualityConfig, planSettings, formatPlanLine, buildFfmpegArgs } from './bitrate.js';
import { RESOLUTION_OPTIONS, resolutionLabel, scaleDimensions } from './resolution.js';
import { formatBytes, formatPercent, reductionPercent, compareSizes, targetVerdict, outputFilename, inputFilename, formatElapsed, formatDurationSec } from './format.js';
import { progressPercent } from './progress.js';
import { MAX_QUEUE, addToQueue, removeFromQueue } from './batch.js';
import { loadFFmpeg, clearFFmpegCache } from './ffmpeg.js';

const $ = (id) => document.getElementById(id);
const dropZone = $('dropZone');
const fileInput = $('fileInput');
const queueList = $('queueList');
const queueNote = $('queueNote');
const queueCountText = $('queueCountText');
const previewPlayer = $('previewPlayer');
const videoNameText = $('videoNameText');
const videoMetaText = $('videoMetaText');
const originalSizeText = $('originalSizeText');
const presetSelect = $('presetSelect');
const customSizeInput = $('customSizeInput');
const resolutionSelect = $('resolutionSelect');
const qualitySelect = $('qualitySelect');
const audioSelect = $('audioSelect');
const planText = $('planText');
const planWarningText = $('planWarningText');
const encoderStatusText = $('encoderStatusText');
const loadEncoderBtn = $('loadEncoderBtn');
const compressBtn = $('compressBtn');
const cancelBtn = $('cancelBtn');
const progressWrap = $('progressWrap');
const progressBar = $('progressBar');
const progressText = $('progressText');
const statusText = $('statusText');
const resultWrap = $('resultWrap');
const resultPlayer = $('resultPlayer');
const resultMetaText = $('resultMetaText');
const compareText = $('compareText');
const resultWarningText = $('resultWarningText');
const downloadBtn = $('downloadBtn');
const resultsList = $('resultsList');
const clearQueueBtn = $('clearQueueBtn');

const state = {
  queue: [],
  activeIndex: -1,
  meta: { duration: 0, width: 0, height: 0 },
  encoder: null,
  encoderLoading: false,
  running: false,
  cancelled: false,
  currentDuration: 0,
  currentItem: null,
  runStart: 0,
  timer: null,
  lastResult: null,
};

function settings() {
  const presetId = presetSelect.value;
  const targetMB = presetMB(presetId, Number(customSizeInput.value));
  return {
    presetId,
    targetMB,
    resolutionId: resolutionSelect.value,
    qualityId: qualitySelect.value,
    audioKbps: Number(audioSelect.value),
  };
}

function currentPlan() {
  const s = settings();
  const dims = scaleDimensions(state.meta.width, state.meta.height, s.resolutionId);
  const plan = planSettings({ targetMB: s.targetMB, durationSec: state.meta.duration, audioKbps: s.audioKbps, outWidth: dims.width, outHeight: dims.height });
  return { plan, dims, s };
}

function refreshPlan() {
  const { plan, s } = currentPlan();
  planText.textContent = formatPlanLine(plan, resolutionLabel(s.resolutionId));
  if (plan && plan.clamp === 'low') {
    planWarningText.hidden = false;
    planWarningText.textContent = 'Note: at this length the target needs less than the minimum video bitrate, so the result may come out larger than the target. A smaller target size will not help here — a lower resolution will.';
  } else if (plan && plan.clamp === 'high') {
    planWarningText.hidden = false;
    planWarningText.textContent = 'Note: this short clip needs more than the maximum video bitrate, so the result may come out smaller than the target.';
  } else {
    planWarningText.hidden = true;
    planWarningText.textContent = '';
  }
  updateCompressEnabled();
}

function updateCompressEnabled() {
  compressBtn.disabled = state.queue.length === 0 || state.running || state.meta.duration <= 0;
}

function renderQueue() {
  queueList.innerHTML = '';
  state.queue.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = i === state.activeIndex ? 'queue-item active' : 'queue-item';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'queue-select';
    select.textContent = `${i + 1}. ${item.name} — ${formatBytes(item.size)}${item.duration > 0 ? ` · ${formatDurationSec(item.duration)}` : ''}`;
    select.addEventListener('click', () => selectItem(i));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn secondary small';
    remove.textContent = 'Remove';
    remove.addEventListener('click', (event) => { event.stopPropagation(); removeItem(i); });
    li.append(select, remove);
    queueList.appendChild(li);
  });
  queueCountText.textContent = state.queue.length === 0
    ? 'Queue is empty. Add up to 3 videos.'
    : `${state.queue.length} of ${MAX_QUEUE} videos in the queue — they are compressed one at a time, in order.`;
  queueNote.hidden = state.queue.length > 0;
  clearQueueBtn.disabled = state.queue.length === 0;
}

function selectItem(index) {
  if (index < 0 || index >= state.queue.length) return;
  state.activeIndex = index;
  const item = state.queue[index];
  previewPlayer.src = item.url;
  videoNameText.textContent = item.name;
  if (item.duration > 0) {
    state.meta = { duration: item.duration, width: item.width, height: item.height };
  } else {
    state.meta = { duration: 0, width: 0, height: 0 };
  }
  updateMetaTexts();
  renderQueue();
  refreshPlan();
}

function removeItem(index) {
  const [removed] = state.queue.splice(index, 1);
  if (removed && removed.url) URL.revokeObjectURL(removed.url);
  if (state.queue.length === 0) {
    state.activeIndex = -1;
    previewPlayer.removeAttribute('src');
    previewPlayer.load();
    videoNameText.textContent = '';
    videoMetaText.textContent = '';
    originalSizeText.textContent = '';
    state.meta = { duration: 0, width: 0, height: 0 };
  } else {
    if (state.activeIndex >= state.queue.length) state.activeIndex = state.queue.length - 1;
    if (state.activeIndex === index || state.activeIndex < 0) state.activeIndex = Math.min(index, state.queue.length - 1);
    selectItem(state.activeIndex);
    return;
  }
  renderQueue();
  refreshPlan();
}

function updateMetaTexts() {
  const item = state.queue[state.activeIndex];
  if (!item) return;
  videoMetaText.textContent = state.meta.duration > 0
    ? `${formatDurationSec(state.meta.duration)} · ${state.meta.width} x ${state.meta.height}`
    : 'Loading video details…';
  originalSizeText.textContent = `Original file: ${formatBytes(item.size)}`;
}

function addFiles(files) {
  let added = 0;
  for (const file of files) {
    if (!file || !file.type.startsWith('video/')) {
      statusText.textContent = 'Only video files can be compressed. Other files were skipped.';
      continue;
    }
    const url = URL.createObjectURL(file);
    const result = addToQueue(state.queue, { file, name: file.name, size: file.size, url, duration: 0, width: 0, height: 0 });
    if (result.error) {
      URL.revokeObjectURL(url);
      statusText.textContent = result.error;
      continue;
    }
    state.queue = result.queue;
    added += 1;
  }
  if (added > 0) {
    statusText.textContent = state.queue.length === 1 ? 'Video ready. Check the plan, then compress.' : `${added} video(s) added to the queue.`;
    renderQueue();
    if (state.activeIndex === -1) selectItem(0);
    else selectItem(state.activeIndex);
  } else if (state.queue.length === 0) {
    renderQueue();
  }
  refreshPlan();
}

previewPlayer.addEventListener('loadedmetadata', () => {
  const duration = previewPlayer.duration;
  const width = previewPlayer.videoWidth;
  const height = previewPlayer.videoHeight;
  if (Number.isFinite(duration) && duration > 0) {
    state.meta = { duration, width, height };
    const item = state.queue[state.activeIndex];
    if (item) { item.duration = duration; item.width = width; item.height = height; }
    statusText.textContent = 'Video ready. Check the plan, then compress.';
    updateMetaTexts();
    renderQueue();
    refreshPlan();
  }
});

function waitForMetadata() {
  if (Number.isFinite(previewPlayer.duration) && previewPlayer.duration > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => { cleanup(); resolve(Number.isFinite(previewPlayer.duration) && previewPlayer.duration > 0); };
    const timer = setTimeout(() => { cleanup(); resolve(false); }, 15000);
    const cleanup = () => { clearTimeout(timer); previewPlayer.removeEventListener('loadedmetadata', done); };
    previewPlayer.addEventListener('loadedmetadata', done);
  });
}

function setProgress(pct, label) {
  progressBar.style.width = `${pct}%`;
  const elapsed = state.runStart ? formatElapsed(Date.now() - state.runStart) : '0:00';
  progressText.textContent = `${label} — ${pct}% · elapsed ${elapsed}`;
}

function startTimer() {
  stopTimer();
  state.timer = setInterval(() => {
    const pct = Number(progressBar.style.width.replace('%', '')) || 0;
    const elapsed = state.runStart ? formatElapsed(Date.now() - state.runStart) : '0:00';
    progressText.textContent = `${progressText.textContent.split(' — ')[0]} — ${pct}% · elapsed ${elapsed}`;
  }, 500);
}

function stopTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

async function loadEncoder() {
  if (state.encoder) return state.encoder;
  if (state.encoderLoading) return null;
  state.encoderLoading = true;
  loadEncoderBtn.disabled = true;
  encoderStatusText.textContent = 'Downloading the FFmpeg core (about 30 MB, first run only)…';
  try {
    state.encoder = await loadFFmpeg((event) => {
      if (!state.running || !state.currentItem) return;
      const pct = progressPercent(event && event.time ? event.time : 0, state.currentDuration);
      setProgress(pct, `Compressing ${state.currentItem.name}`);
    });
    encoderStatusText.textContent = 'Encoder ready. Compression runs locally in your browser.';
    return state.encoder;
  } catch (err) {
    encoderStatusText.textContent = err && err.message ? err.message : 'FFmpeg encoder did not load.';
    statusText.textContent = 'FFmpeg encoder did not load. Check your connection and try "Load encoder" again.';
    return null;
  } finally {
    state.encoderLoading = false;
    loadEncoderBtn.disabled = false;
  }
}

async function compressQueue() {
  if (state.running || state.queue.length === 0) return;
  const encoder = await loadEncoder();
  if (!encoder) return;
  state.running = true;
  state.cancelled = false;
  state.runStart = Date.now();
  cancelBtn.hidden = false;
  progressWrap.hidden = false;
  resultWrap.hidden = true;
  resultsList.innerHTML = '';
  updateCompressEnabled();
  startTimer();
  const s = settings();
  const quality = qualityConfig(s.qualityId);
  try {
    for (let i = 0; i < state.queue.length; i += 1) {
      if (state.cancelled) break;
      const item = state.queue[i];
      state.currentItem = item;
      statusText.textContent = `Compressing video ${i + 1} of ${state.queue.length}: ${item.name}…`;
      setProgress(0, `Compressing ${item.name}`);
      selectItem(i);
      const hasMeta = await waitForMetadata();
      if (state.cancelled) break;
      if (!hasMeta && !(item.duration > 0)) {
        appendResult(item, null, 'Could not read this video’s length, so it was skipped. Try it on its own in another browser.');
        continue;
      }
      if (item.duration > 0) state.meta = { duration: item.duration, width: item.width, height: item.height };
      state.currentDuration = state.meta.duration;
      const dims = scaleDimensions(state.meta.width, state.meta.height, s.resolutionId);
      const plan = planSettings({ targetMB: s.targetMB, durationSec: state.meta.duration, audioKbps: s.audioKbps, outWidth: dims.width, outHeight: dims.height });
      if (!plan) {
        appendResult(item, null, 'Could not plan this video (unknown length). It was skipped.');
        continue;
      }
      const inputName = inputFilename(item.name);
      const outputName = 'output.mp4';
      const args = buildFfmpegArgs({ inputName, outputName, width: dims.width, height: dims.height, videoKbps: plan.videoKbps, audioKbps: plan.audioKbps, x264Preset: quality.x264Preset });
      try {
        await encoder.ffmpeg.writeFile(inputName, await encoder.fetchFile(item.file));
        await encoder.ffmpeg.exec(args);
        if (state.cancelled) break;
        const data = await encoder.ffmpeg.readFile(outputName);
        const blob = new Blob([data.slice()], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        appendResult(item, { url, size: blob.size, plan, dims }, '');
        state.lastResult = { url, name: outputFilename(item.name), size: blob.size };
        resultPlayer.src = url;
        downloadBtn.href = url;
        downloadBtn.download = outputFilename(item.name);
        resultWrap.hidden = false;
        resultMetaText.textContent = `${dims.width} x ${dims.height} · ${formatBytes(blob.size)} · target ${plan.targetMB} MB`;
        compareText.textContent = compareSizes(item.size, blob.size);
        const verdict = targetVerdict(blob.size, plan.targetMB);
        const reduction = reductionPercent(item.size, blob.size);
        resultWarningText.hidden = false;
        if (blob.size > item.size) {
          resultWarningText.textContent = `${verdict} The compressed file is larger than the original (${formatPercent(blob.size, item.size)}). Try a smaller target or a lower resolution.`;
        } else {
          resultWarningText.textContent = `${verdict} Size reduced by ${reduction}% (${formatBytes(item.size)} to ${formatBytes(blob.size)}).`;
        }
      } catch (err) {
        if (state.cancelled) break;
        appendResult(item, null, `Compression failed: ${err && err.message ? err.message : String(err)}`);
      } finally {
        try { await encoder.ffmpeg.deleteFile(inputName); } catch (_) { /* already gone */ }
        try { await encoder.ffmpeg.deleteFile(outputName); } catch (_) { /* already gone */ }
      }
    }
  } finally {
    state.running = false;
    state.currentItem = null;
    stopTimer();
    cancelBtn.hidden = true;
    progressWrap.hidden = true;
    if (state.cancelled) {
      statusText.textContent = 'Compression cancelled. The encoder was stopped; load it again for the next run.';
      state.encoder = null;
      clearFFmpegCache();
    } else {
      statusText.textContent = 'Done. Download your compressed videos below.';
    }
    updateCompressEnabled();
    refreshPlan();
  }
}

function appendResult(item, result, error) {
  const li = document.createElement('li');
  li.className = 'result-item';
  if (error) {
    li.textContent = `${item.name}: ${error}`;
  } else {
    const a = document.createElement('a');
    a.href = result.url;
    a.download = outputFilename(item.name);
    a.textContent = `Download ${outputFilename(item.name)}`;
    li.textContent = `${item.name}: ${formatBytes(item.size)} to ${formatBytes(result.size)} (${formatPercent(result.size, item.size)} of original). `;
    li.appendChild(a);
  }
  resultsList.appendChild(li);
}

function cancelRun() {
  if (!state.running) return;
  state.cancelled = true;
  statusText.textContent = 'Cancelling…';
  if (state.encoder && state.encoder.ffmpeg) {
    try { state.encoder.ffmpeg.terminate(); } catch (_) { /* terminate is best-effort */ }
  }
}

/* Intake wiring */
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  if (event.dataTransfer && event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) addFiles(fileInput.files);
  fileInput.value = '';
});
document.addEventListener('paste', (event) => {
  const files = event.clipboardData ? [...event.clipboardData.files].filter((f) => f.type.startsWith('video/')) : [];
  if (files.length > 0) addFiles(files);
});
clearQueueBtn.addEventListener('click', () => {
  for (const item of state.queue) { if (item.url) URL.revokeObjectURL(item.url); }
  state.queue = [];
  state.activeIndex = -1;
  state.meta = { duration: 0, width: 0, height: 0 };
  previewPlayer.removeAttribute('src');
  previewPlayer.load();
  videoNameText.textContent = '';
  videoMetaText.textContent = '';
  originalSizeText.textContent = '';
  statusText.textContent = 'Add a video to get started.';
  renderQueue();
  refreshPlan();
});

/* Settings wiring */
for (const select of [presetSelect, resolutionSelect, qualitySelect, audioSelect]) {
  select.addEventListener('change', () => {
    customSizeInput.disabled = presetSelect.value !== 'custom';
    refreshPlan();
  });
}
customSizeInput.addEventListener('input', refreshPlan);
loadEncoderBtn.addEventListener('click', loadEncoder);
compressBtn.addEventListener('click', compressQueue);
cancelBtn.addEventListener('click', cancelRun);
document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (event.key === 'c' || event.key === 'C') { if (!compressBtn.disabled) compressQueue(); }
  if (event.key === 'Escape') cancelRun();
});

/* Populate selects from the pure modules (single source of truth). */
for (const preset of TARGET_PRESETS) {
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = preset.label;
  presetSelect.appendChild(option);
}
presetSelect.value = '16';
for (const option of RESOLUTION_OPTIONS) {
  const el = document.createElement('option');
  el.value = option.id;
  el.textContent = option.label;
  resolutionSelect.appendChild(el);
}
resolutionSelect.value = '720';
for (const key of ['faster', 'balanced', 'smaller']) {
  const el = document.createElement('option');
  el.value = key;
  el.textContent = QUALITY_PRESETS[key].label;
  qualitySelect.appendChild(el);
}
qualitySelect.value = 'balanced';
customSizeInput.disabled = true;
customSizeInput.value = '10';
statusText.textContent = 'Add a video to get started.';
planText.textContent = formatPlanLine(null);
refreshPlan();
renderQueue();
