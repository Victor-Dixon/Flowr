/**
 * Flowr Timer — single-file vanilla JS MVP
 * - Timer with startedAt / endedAt / duration
 * - Session history in localStorage (last 10)
 * - Optional voice auto-stop via Web Speech API + simulate fallback
 */

const HISTORY_KEY = "flowr:sessions:v1";
const HISTORY_LIMIT = 10;

/** @typedef {"idle"|"running"|"stopped"} FlowrStatus */
/** @typedef {"manual"|"voice_any"|"voice_keyword"|"error"} StopReason */

/**
 * @typedef {Object} FlowrSession
 * @property {string} id
 * @property {string} startedAt ISO string
 * @property {string} endedAt ISO string
 * @property {number} durationMs
 * @property {StopReason} stopReason
 * @property {boolean} voiceEnabled
 * @property {"any"|"keyword"|null} voiceMode
 * @property {string|null} keyword
 * @property {string|null} transcriptSnippet
 */

const els = {
  elapsed: /** @type {HTMLElement} */ (document.getElementById("elapsed")),
  statusPill: /** @type {HTMLElement} */ (document.getElementById("statusPill")),
  statusMeta: /** @type {HTMLElement} */ (document.getElementById("statusMeta")),
  ariaStatus: /** @type {HTMLElement} */ (document.getElementById("ariaStatus")),
  startedAt: /** @type {HTMLElement} */ (document.getElementById("startedAt")),
  endedAt: /** @type {HTMLElement} */ (document.getElementById("endedAt")),
  duration: /** @type {HTMLElement} */ (document.getElementById("duration")),
  stopReason: /** @type {HTMLElement} */ (document.getElementById("stopReason")),
  startBtn: /** @type {HTMLButtonElement} */ (document.getElementById("startBtn")),
  stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById("stopBtn")),
  resetBtn: /** @type {HTMLButtonElement} */ (document.getElementById("resetBtn")),
  voiceSupportBadge: /** @type {HTMLElement} */ (document.getElementById("voiceSupportBadge")),
  voiceEnabled: /** @type {HTMLInputElement} */ (document.getElementById("voiceEnabled")),
  voiceModeFieldset: /** @type {HTMLFieldSetElement} */ (document.getElementById("voiceModeFieldset")),
  keywordInput: /** @type {HTMLInputElement} */ (document.getElementById("keywordInput")),
  voiceHint: /** @type {HTMLElement} */ (document.getElementById("voiceHint")),
  voiceRuntimeState: /** @type {HTMLElement} */ (document.getElementById("voiceRuntimeState")),
  simulateBtn: /** @type {HTMLButtonElement} */ (document.getElementById("simulateBtn")),
  historyTbody: /** @type {HTMLElement} */ (document.getElementById("historyTbody")),
};

/** @type {FlowrStatus} */
let status = "idle";
/** @type {number|null} */
let startedAtMs = null;
/** @type {number|null} */
let endedAtMs = null;
/** @type {StopReason|null} */
let stopReason = null;
/** @type {number} */
let rafId = 0;

// Voice
const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;
/** @type {SpeechRecognition|null} */
let recognition = null;
/** @type {boolean} */
let speechSupported = Boolean(SpeechRecognitionCtor);
/** @type {boolean} */
let recognitionStarting = false;
/** @type {string} */
let lastTranscript = "";

function nowMs() {
  return Date.now();
}

function fmtTimeHMS(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtDurationMs(ms) {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    millis
  ).padStart(3, "0")}`;
}

function getVoiceMode() {
  const checked = /** @type {HTMLInputElement|null} */ (
    document.querySelector('input[name="voiceMode"]:checked')
  );
  return checked?.value === "keyword" ? "keyword" : "any";
}

function getKeyword() {
  return els.keywordInput.value.trim();
}

function announce(msg) {
  els.ariaStatus.textContent = msg;
}

function setStatus(next, meta = "") {
  status = next;
  els.statusPill.textContent = next[0].toUpperCase() + next.slice(1);
  els.statusMeta.textContent = meta ? `· ${meta}` : "";
}

function updateControls() {
  const running = status === "running";
  els.startBtn.disabled = running;
  els.stopBtn.disabled = !running;

  const mode = getVoiceMode();
  const keywordMode = mode === "keyword";
  els.keywordInput.disabled = !keywordMode || !els.voiceEnabled.checked || !speechSupported;
}

function resetDisplayToIdle() {
  els.elapsed.textContent = "00:00.000";
  els.startedAt.textContent = "—";
  els.endedAt.textContent = "—";
  els.duration.textContent = "—";
  els.stopReason.textContent = "—";
}

function renderRunningFrame() {
  if (status !== "running" || startedAtMs == null) return;
  const elapsedMs = nowMs() - startedAtMs;
  els.elapsed.textContent = fmtDurationMs(elapsedMs);
  rafId = requestAnimationFrame(renderRunningFrame);
}

function stopAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function safeUUID() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/** @returns {FlowrSession[]} */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return /** @type {FlowrSession[]} */ (parsed);
  } catch {
    return [];
  }
}

/** @param {FlowrSession[]} sessions */
function saveHistory(sessions) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, HISTORY_LIMIT)));
  } catch {
    // ignore storage errors in MVP
  }
}

function renderHistory() {
  const sessions = loadHistory();
  if (!sessions.length) {
    els.historyTbody.innerHTML =
      '<tr><td class="muted" colspan="4">No sessions yet.</td></tr>';
    return;
  }
  els.historyTbody.innerHTML = sessions
    .slice(0, HISTORY_LIMIT)
    .map((s) => {
      const start = fmtTimeHMS(new Date(s.startedAt));
      const end = fmtTimeHMS(new Date(s.endedAt));
      const duration = fmtDurationMs(s.durationMs);
      const reason = s.stopReason;
      return `<tr>
        <td class="mono">${escapeHtml(start)}</td>
        <td class="mono">${escapeHtml(end)}</td>
        <td class="mono">${escapeHtml(duration)}</td>
        <td class="mono">${escapeHtml(reason)}</td>
      </tr>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * @param {{ status: "running" | "finished"; autoFinishTs?: number | null; finishTs?: number | null }} state
 * @param {number} now
 */
function finishIfDue(state, now) {
  if (!state || state.status !== "running") return state;
  const autoFinishTs = state.autoFinishTs;
  if (!autoFinishTs) return state;
  if (now < autoFinishTs) return state;

  // Record the scheduled finish time, not the time we noticed it.
  // This keeps the session deterministic across reloads / background tabs.
  const finished = { ...state, finishTs: autoFinishTs };
  finished.status = "finished";
  return finished;
}

// Optional: tiny regression guard (runs only in local dev)
// Set window.__FLOWR_DEV_TESTS__ = true in console to run.
function __flowr_run_dev_tests__() {
  try {
    const start = 1000;
    const due = 2000;
    const s = { status: "running", startTs: start, autoFinishTs: due, finishTs: null };
    const out = finishIfDue(s, 999999);
    if (out.finishTs !== due) {
      throw new Error("finishIfDue should set finishTs=autoFinishTs");
    }
    console.log("✅ Flowr dev tests: PASS");
  } catch (e) {
    console.error("❌ Flowr dev tests: FAIL", e);
  }
}
if (typeof window !== "undefined" && window.__FLOWR_DEV_TESTS__ === true) {
  __flowr_run_dev_tests__();
}

function pushSessionToHistory(session) {
  const existing = loadHistory();
  const next = [session, ...existing].slice(0, HISTORY_LIMIT);
  saveHistory(next);
  renderHistory();
}

function ensureRecognition() {
  if (!speechSupported || !SpeechRecognitionCtor) return null;
  if (recognition) return recognition;

  const r = new SpeechRecognitionCtor();
  r.continuous = true;
  r.interimResults = true;
  // Language left default; browser may infer.

  r.onstart = () => {
    recognitionStarting = false;
    els.voiceRuntimeState.textContent = "listening…";
  };

  r.onend = () => {
    els.voiceRuntimeState.textContent = "";
    if (status === "running" && els.voiceEnabled.checked && speechSupported) {
      // Edge case: recognition ends; attempt restart while running.
      startRecognition();
    }
  };

  r.onerror = (ev) => {
    els.voiceRuntimeState.textContent = "";
    const err = ev?.error ? String(ev.error) : "unknown_error";
    announce(`Voice error: ${err}. Manual timer still works.`);
  };

  r.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const part = res?.[0]?.transcript ?? "";
      transcript += part;
    }
    transcript = transcript.trim();
    if (!transcript) return;

    lastTranscript = transcript;
    maybeVoiceStop(transcript);
  };

  recognition = r;
  return recognition;
}

function startRecognition() {
  if (!speechSupported || !els.voiceEnabled.checked) return;
  if (status !== "running") return;
  if (recognitionStarting) return;

  const r = ensureRecognition();
  if (!r) return;

  try {
    recognitionStarting = true;
    r.start();
  } catch {
    // start() can throw if already started; ignore in MVP.
    recognitionStarting = false;
  }
}

function stopRecognition() {
  recognitionStarting = false;
  if (!recognition) return;
  try {
    recognition.onend = null; // prevent auto-restart loop when we're intentionally stopping
    recognition.stop();
  } catch {
    // ignore
  } finally {
    // Restore handler for next run
    const r = recognition;
    r.onend = () => {
      els.voiceRuntimeState.textContent = "";
      if (status === "running" && els.voiceEnabled.checked && speechSupported) {
        startRecognition();
      }
    };
  }
}

function maybeVoiceStop(transcript) {
  if (status !== "running") return;
  if (!els.voiceEnabled.checked) return;

  const mode = getVoiceMode();
  if (mode === "any") {
    handleStop("voice_any", transcript);
    return;
  }

  const keyword = getKeyword();
  if (!keyword) return;
  const hay = transcript.toLowerCase();
  const needle = keyword.toLowerCase();
  if (hay.includes(needle)) {
    handleStop("voice_keyword", transcript);
  }
}

function handleStart() {
  if (status === "running") return; // Double Start prevented

  stopAnimation();
  stopRecognition();

  startedAtMs = nowMs();
  endedAtMs = null;
  stopReason = null;
  lastTranscript = "";

  setStatus("running");
  els.startedAt.textContent = fmtTimeHMS(new Date(startedAtMs));
  els.endedAt.textContent = "—";
  els.duration.textContent = "—";
  els.stopReason.textContent = "—";

  updateControls();
  announce("Started.");

  rafId = requestAnimationFrame(renderRunningFrame);
  startRecognition();
}

/** @param {StopReason} reason */
function handleStop(reason, transcriptForStop = "") {
  if (status !== "running" || startedAtMs == null) return; // Stop without Start no-op

  endedAtMs = nowMs();
  stopReason = reason;

  stopAnimation();
  stopRecognition();

  const durationMs = Math.max(0, endedAtMs - startedAtMs);

  setStatus("stopped", reason.replace("_", " "));
  els.endedAt.textContent = fmtTimeHMS(new Date(endedAtMs));
  els.duration.textContent = fmtDurationMs(durationMs);
  els.stopReason.textContent = reason;
  els.elapsed.textContent = fmtDurationMs(durationMs);

  updateControls();
  announce(reason.startsWith("voice") ? "Stopped by voice." : "Stopped.");

  /** @type {FlowrSession} */
  const session = {
    id: safeUUID(),
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs,
    stopReason: reason,
    voiceEnabled: Boolean(els.voiceEnabled.checked),
    voiceMode: els.voiceEnabled.checked ? getVoiceMode() : null,
    keyword: els.voiceEnabled.checked && getVoiceMode() === "keyword" ? getKeyword() : null,
    transcriptSnippet: null, // MVP default: do not persist transcript
  };

  // If user really wants, they can inspect lastTranscript in runtime, but we don't store it.
  void transcriptForStop;

  pushSessionToHistory(session);
}

function handleReset() {
  stopAnimation();
  stopRecognition();

  status = "idle";
  startedAtMs = null;
  endedAtMs = null;
  stopReason = null;
  lastTranscript = "";

  setStatus("idle");
  resetDisplayToIdle();
  updateControls();
  announce("Reset.");
}

function updateVoiceSupportUI() {
  if (speechSupported) {
    els.voiceSupportBadge.textContent = "Supported";
    els.voiceSupportBadge.title =
      "Your browser supports the Web Speech recognition API.";
    els.voiceEnabled.disabled = false;
    els.voiceModeFieldset.disabled = false;
    els.voiceHint.textContent =
      "When enabled, Flowr will stop the running timer when speech is recognized.";
  } else {
    els.voiceSupportBadge.textContent = "Not supported";
    els.voiceSupportBadge.title =
      "SpeechRecognition is not available in this browser/environment.";
    els.voiceEnabled.checked = false;
    els.voiceEnabled.disabled = true;
    els.voiceModeFieldset.disabled = true;
    els.keywordInput.disabled = true;
    els.voiceHint.textContent =
      "Voice auto-stop is not supported here. You can still use the manual timer (and the simulate button for demos).";
  }
}

function bindEvents() {
  els.startBtn.addEventListener("click", handleStart);
  els.stopBtn.addEventListener("click", () => handleStop("manual"));
  els.resetBtn.addEventListener("click", handleReset);

  els.simulateBtn.addEventListener("click", () => {
    // Dev/demo fallback: simulate a word being heard.
    const simulated = getVoiceMode() === "keyword" ? getKeyword() || "stop" : "hello";
    announce(`Simulated transcript: "${simulated}".`);
    if (status !== "running") return;

    // Simulate should work even when SpeechRecognition is unsupported or voice is disabled.
    const mode = getVoiceMode();
    if (mode === "any") {
      handleStop("voice_any", simulated);
      return;
    }
    const keyword = getKeyword() || "stop";
    const hay = simulated.toLowerCase();
    const needle = keyword.toLowerCase();
    if (hay.includes(needle)) {
      handleStop("voice_keyword", simulated);
    }
  });

  els.voiceEnabled.addEventListener("change", () => {
    updateControls();
    if (status === "running" && els.voiceEnabled.checked) {
      announce("Voice enabled. Listening will start.");
      startRecognition();
    }
    if (!els.voiceEnabled.checked) {
      announce("Voice disabled.");
      stopRecognition();
    }
  });

  document.querySelectorAll('input[name="voiceMode"]').forEach((el) => {
    el.addEventListener("change", () => {
      updateControls();
      if (getVoiceMode() === "keyword") {
        els.keywordInput.focus();
      }
    });
  });

  els.keywordInput.addEventListener("input", () => {
    updateControls();
  });

  window.addEventListener("beforeunload", () => {
    stopAnimation();
    stopRecognition();
  });
}

function init() {
  updateVoiceSupportUI();
  setStatus("idle");
  resetDisplayToIdle();
  updateControls();
  bindEvents();
  renderHistory();
}

init();
