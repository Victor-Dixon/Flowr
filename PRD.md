# Flowr Timer — Product Requirements Document (PRD)
**Owner:** Flowr  
**Status:** Draft (MVP)  
**Last updated:** 2025-12-24

## 1) Overview
Flowr is a lightweight timer that answers:
- **What time did we start Flowr?**
- **What time did we end Flowr?**
- **How long did Flowr last?**

Optional hands-free behavior:
- **Auto-stop after the user says a word** (speech detection/recognition).

## 2) Problem
Users want a fast, low-friction way to time short sessions with explicit **start timestamp**, **end timestamp**, and **duration**. In some contexts (hands full / on the move), they also want Flowr to **stop automatically after speech**.

## 3) Goals (MVP)
- One-tap **Start**, **Stop**, **Reset**
- Accurate timestamps + duration
- Clear UI state: Idle / Running / Stopped
- Optional **voice auto-stop**:
  - Stop after *any* recognized speech
  - Stop after *keyword* recognized
- Basic session history (last N runs)

## 4) Non-goals (MVP)
- Accounts, cloud sync, multi-device
- Guaranteed background timing across sleep/termination
- Advanced on-device VAD/ML beyond platform speech APIs
- Long audio storage or transcription archives

## 5) Target Users
- Individuals timing short focused sessions (phone/laptop)
- Creators/operators needing “speak once to stop” flows

## 6) Core User Stories
- As a user, I can press **Start** and instantly see the timer running.
- As a user, I can press **Stop** and see end time + duration.
- As a user, I can press **Reset** to clear the current run display.
- As a user, I can enable **Auto-stop (voice)** to stop hands-free.
- As a user, I can choose **Any word** or **Keyword** stop.
- As a user, I can see my **recent sessions**.

## 7) UX Requirements (Single-screen MVP)
### Main Timer Card
- Large elapsed timer (mm:ss.mmm or mm:ss)
- Start time (HH:MM:SS)
- End time (HH:MM:SS)
- Duration
- Status label: Idle / Running / Stopped (+ stop reason)
- Controls: Start / Stop / Reset

### Voice Panel (Optional)
- Toggle: Enable voice auto-stop
- Mode selector:
  - Any word
  - Keyword
- Keyword input (only enabled in Keyword mode)
- “Voice supported / not supported” message
- Dev/demo fallback action: **Simulate word heard** (for unsupported environments)

## 8) Functional Requirements
### 8.1 Timer
- Start:
  - records `startedAt` (local timestamp)
  - begins elapsed updates (UI)
- Stop:
  - records `endedAt`
  - freezes elapsed
  - computes duration = endedAt - startedAt
  - stores session to history
- Reset:
  - clears current session display (does not delete history unless explicitly designed)

### 8.2 Voice Auto-stop (Optional)
- When enabled and permission granted:
  - Any word: stop on first non-empty recognized transcript
  - Keyword: stop only when transcript matches keyword (substring OK for MVP)
- If speech recognition unsupported:
  - manual timer still works
  - voice toggle is disabled OR shows “unsupported” state
  - simulate button still works (optional)

### 8.3 History
- Keep last N sessions (default 10)
- Display columns:
  - Start time
  - End time
  - Duration
  - Stop reason

## 9) Stop Reasons
Enum `stopReason`:
- `manual`
- `voice_any`
- `voice_keyword`
- `error` (optional)

## 10) Data Model
`FlowrSession`
- `id`: string (uuid)
- `startedAt`: ISO timestamp
- `endedAt`: ISO timestamp
- `durationMs`: number
- `stopReason`: enum
- `voiceEnabled`: boolean
- `voiceMode`: `any | keyword | null`
- `keyword`: string | null
- `transcriptSnippet`: string | null (MVP default: null)

Storage (MVP):
- localStorage (web) OR local device storage (mobile)

## 11) Edge Cases
- Double Start: ignored / prevented
- Stop without Start: no-op
- Permission denied: show non-blocking warning; keep manual timer
- Recognition ends while running: attempt restart while voice enabled (web)
- Device time changes: acceptable for MVP (later: use monotonic clock where available)

## 12) Accessibility
- Tap targets 44px+ on mobile
- Keyboard support for Start/Stop/Reset (web)
- Status updates via aria-live (web)

## 13) Privacy
- Voice is opt-in only
- Do not store raw audio (MVP)
- Do not persist transcript by default (MVP)
- Disclose mic permission usage clearly

## 14) Analytics (Optional)
Events:
- `flowr_start` { voiceEnabled, voiceMode }
- `flowr_stop` { stopReason, durationMs }
- `flowr_reset`
- `voice_permission_denied`
- `voice_unsupported`

## 15) Acceptance Criteria (MVP)
- Start sets start time and begins elapsed updates
- Stop sets end time and duration, stops updating
- Reset returns to Idle state display
- Voice (supported):
  - Any word stops on first detected speech transcript
  - Keyword stops only when keyword present
- Voice (unsupported):
  - UI clearly indicates limitation
  - manual timer fully functional

