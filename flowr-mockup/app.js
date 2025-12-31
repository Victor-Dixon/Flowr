/**
 * Flowr mockup — cartoon clock + smoke
 * - Progress runs start -> end (auto-finish)
 * - Elapsed time centered
 * - Ends line: “Ends in … · finish time”
 * - Focus mode makes clock bigger
 * - Wobble + smoke only while running
 * - Smoke trail strength reacts to progress (CSS var)
 */

const els = {
  durationMin: /** @type {HTMLInputElement} */ (document.getElementById("durationMin")),
  startBtn: /** @type {HTMLButtonElement} */ (document.getElementById("startBtn")),
  stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById("stopBtn")),
  resetBtn: /** @type {HTMLButtonElement} */ (document.getElementById("resetBtn")),
  focusToggle: /** @type {HTMLInputElement} */ (document.getElementById("focusToggle")),
  elapsed: /** @type {HTMLElement} */ (document.getElementById("elapsed")),
  endsLine: /** @type {HTMLElement} */ (document.getElementById("endsLine")),
  handGroup: /** @type {SVGGElement} */ (document.getElementById("handGroup")),
  mouthPath: /** @type {SVGPathElement} */ (document.getElementById("mouthPath")),
  pupilL: /** @type {SVGCircleElement} */ (document.getElementById("pupilL")),
  pupilR: /** @type {SVGCircleElement} */ (document.getElementById("pupilR")),
};

const FOCUS_KEY = "flowr:mockup:focus:v1";

/** @typedef {"idle"|"running"|"stopped"|"finished"} Status */

/** @type {Status} */
let status = "idle";
/** @type {number|null} */
let startedAtMs = null;
/** @type {number|null} */
let endsAtMs = null;
/** @type {number} */
let durationMs = 25 * 60 * 1000;
/** @type {number} */
let rafId = 0;

function nowMs() {
  return Date.now();
}

function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function fmtDurationShort(ms) {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 100) return `${minutes}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function fmtClockHM(tsMs) {
  const d = new Date(tsMs);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function readDurationMs() {
  const raw = Number(els.durationMin.value);
  const min = Number.isFinite(raw) ? Math.max(1, Math.min(180, raw)) : 25;
  return min * 60 * 1000;
}

function setRootVar(name, value) {
  document.documentElement.style.setProperty(name, String(value));
}

function setBodyFlags() {
  document.body.classList.toggle("running", status === "running");
  document.body.classList.toggle("finished", status === "finished");
}

function updateControls() {
  const running = status === "running";
  els.startBtn.disabled = running;
  els.stopBtn.disabled = !running;
  els.durationMin.disabled = running;
}

function setFocusMode(on) {
  document.body.classList.toggle("focus", on);
  els.focusToggle.checked = on;
  try {
    localStorage.setItem(FOCUS_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

function readInitialFocusMode() {
  const params = new URLSearchParams(location.search);
  if (params.get("focus") === "1") return true;
  if (params.get("focus") === "0") return false;
  try {
    return localStorage.getItem(FOCUS_KEY) === "1";
  } catch {
    return false;
  }
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function resetDisplay() {
  els.elapsed.textContent = "00:00";
  els.endsLine.textContent = "Ends in — · —";
  setRootVar("--progress", 0);
  setRootVar("--smokeStrength", 0);
  setHandRotation(0);
  setMouth(0);
  setPupils(0);
}

function setHandRotation(progress, t = 0) {
  // 0..1 => 0..360, plus a tiny “cartoon jitter” when running.
  const baseDeg = 360 * clamp01(progress);
  const wobble = status === "running" ? Math.sin(t / 190) * (1.2 + 2.2 * progress) : 0;
  const deg = baseDeg + wobble;
  // Use SVG transform attribute for consistent cross-browser rotation.
  els.handGroup.setAttribute("transform", `rotate(${deg} 200 200)`);
}

function setPupils(progress) {
  // Pupils “look ahead” slightly as progress increases.
  const p = clamp01(progress);
  const dx = 5 + 6 * p;
  const dy = 2 + 2 * (1 - p);
  els.pupilL.setAttribute("cx", String(163 + dx));
  els.pupilL.setAttribute("cy", String(175 + dy));
  els.pupilR.setAttribute("cx", String(253 + dx));
  els.pupilR.setAttribute("cy", String(175 + dy));
}

function setMouth(progress) {
  // Morph from “small grin” to “bigger grin” over progress.
  const p = clamp01(progress);
  const yBase = 248 - 10 * p;
  const yCtrl = 272 - 28 * p;
  const d = `M150 ${yBase} C175 ${yCtrl}, 225 ${yCtrl}, 250 ${yBase}`;
  els.mouthPath.setAttribute("d", d);
}

function renderFrame() {
  if (status !== "running" || startedAtMs == null || endsAtMs == null) return;

  const t = nowMs();
  const elapsed = Math.max(0, t - startedAtMs);
  const remaining = Math.max(0, endsAtMs - t);
  const p = clamp01(durationMs > 0 ? elapsed / durationMs : 0);

  els.elapsed.textContent = fmtDurationShort(elapsed);
  els.endsLine.textContent = `Ends in ${fmtDurationShort(remaining)} · ${fmtClockHM(endsAtMs)}`;

  setRootVar("--progress", p);
  // Make smoke ramp a little later so early progress doesn’t instantly go full fog.
  const smoke = clamp01(Math.pow(p, 1.35));
  setRootVar("--smokeStrength", smoke);

  setHandRotation(p, t);
  setPupils(p);
  setMouth(p);

  if (p >= 1 || remaining <= 0) {
    handleFinish();
    return;
  }

  rafId = requestAnimationFrame(renderFrame);
}

function handleStart() {
  if (status === "running") return;
  durationMs = readDurationMs();

  startedAtMs = nowMs();
  endsAtMs = startedAtMs + durationMs;
  status = "running";
  setBodyFlags();
  updateControls();

  stopLoop();
  rafId = requestAnimationFrame(renderFrame);
}

function handleStop() {
  if (status !== "running") return;
  status = "stopped";
  setBodyFlags();
  updateControls();
  stopLoop();
  // Keep the last rendered frame as-is.
}

function handleFinish() {
  status = "finished";
  setBodyFlags();
  updateControls();
  stopLoop();

  setRootVar("--progress", 1);
  setRootVar("--smokeStrength", 1);
  setHandRotation(1, nowMs());
  // Turn off smoke immediately after “finish” to match “only while running”.
  // (We leave the “finished” state so you can style it later if desired.)
  document.body.classList.remove("running");
}

function handleReset() {
  stopLoop();
  status = "idle";
  startedAtMs = null;
  endsAtMs = null;
  durationMs = readDurationMs();
  setBodyFlags();
  updateControls();
  resetDisplay();
}

function bindEvents() {
  els.startBtn.addEventListener("click", handleStart);
  els.stopBtn.addEventListener("click", handleStop);
  els.resetBtn.addEventListener("click", handleReset);

  els.durationMin.addEventListener("change", () => {
    if (status === "running") return;
    durationMs = readDurationMs();
  });

  els.focusToggle.addEventListener("change", () => {
    setFocusMode(Boolean(els.focusToggle.checked));
  });
}

function init() {
  setFocusMode(readInitialFocusMode());
  resetDisplay();
  updateControls();
  bindEvents();
}

init();

