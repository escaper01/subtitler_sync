/**
 * Shared logic for the local test harness pages.
 *
 * Generates a video whose src is a `blob:` URL, which is what the real target site does
 * (JW Player + hls.js feed an MSE buffer). That makes this a faithful local stand-in for
 * detection and overlay work — no network, no dependency on the site being up.
 */

export function setupHarness({ video, status, label, buttons }) {
  const draw = makeCanvasSource(label);

  async function record(seconds) {
    setStatus(`Recording ${seconds}s clip…`);
    for (const button of buttons) button.disabled = true;

    const stream = draw.canvas.captureStream(25);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const done = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    recorder.start();
    const startedAt = performance.now();
    const tick = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      setStatus(`Recording… ${elapsed.toFixed(0)}s / ${seconds}s`);
    }, 500);

    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    recorder.stop();
    await done;
    clearInterval(tick);

    const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
    video.src = URL.createObjectURL(blob);

    // MediaRecorder's WebM output has no duration in its header, so `video.duration`
    // reports Infinity until the file is seeked to the end. Without this the extension
    // would sit forever at "waiting for metadata" — which is a real state worth being
    // able to reproduce, but not the default we want from the fixture.
    await resolveDuration(video);

    setStatus(
      `Ready — ${video.duration.toFixed(1)}s blob: video. ` +
        (video.duration >= 90
          ? 'Long enough to be auto-detected as a film.'
          : 'Shorter than the 90s threshold, so the extension will list it as skipped.'),
    );
    for (const button of buttons) button.disabled = false;
  }

  function setStatus(text) {
    status.textContent = text;
  }

  return { record };
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

/** Force a WebM blob with an unknown duration to report its real one. */
function resolveDuration(video) {
  return new Promise((resolve) => {
    const onMeta = () => {
      if (video.duration !== Infinity) {
        video.removeEventListener('loadedmetadata', onMeta);
        resolve();
        return;
      }
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        video.currentTime = 0;
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = 1e101;
    };
    video.addEventListener('loadedmetadata', onMeta);
    if (video.readyState >= 1) onMeta();
  });
}

/** A canvas that renders a running timecode, so sync drift is visible by eye. */
function makeCanvasSource(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  const start = performance.now();

  (function frame() {
    const t = (performance.now() - start) / 1000;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(t), canvas.width / 2, canvas.height / 2);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 48);

    // A moving bar makes dropped/duplicated frames obvious.
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect((t * 120) % canvas.width, canvas.height - 24, 60, 12);

    requestAnimationFrame(frame);
  })();

  return { canvas };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
