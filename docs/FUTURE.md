# Future Features

Open questions and planned enhancements.

---

## Open Questions

1. **Video viewport broadcasting** — OBS integration or custom video stream?
2. **Offline support** — PWA with local caching for song library?
3. **Mobile apps** — React Native or web-only?
4. **Monetization** — Free tier limits, church subscription pricing?
5. **Song licensing** — CCLI integration for copyright compliance?

---

## Planned Features

### Synchronized Metronome

**Goal**: Provide a precisely synchronized metronome across all instrument and stage viewports.

**Approach**:
- Do NOT send individual tick events through WebSocket (latency makes this unreliable)
- Presenter sets metronome parameters: **BPM**, **time signature**, and **start timestamp** (ISO 8601, millisecond precision)
- Broadcast only: `{ bpm: number, timeSignature: string, startAt: string }`
- Each client independently calculates all future tick absolute timestamps from the start time
- Clients use `performance.now()` or `Date.now()` to schedule tick playback locally

**Benefits**:
- Zero network dependency for tick timing after initial sync
- All devices play ticks at exactly the same moment
- Works even with high-latency connections

**Considerations**:
- Clients may need NTP sync or server time offset calibration for perfect sync
- Provide visual beat indicator (flash/pulse) alongside optional audio tick

---

### Guitar Tuner (Local)

**Goal**: Provide an in-app chromatic tuner for musicians to tune their instruments.

**Approach**:
- Use Web Audio API + `getUserMedia()` to access microphone
- Perform pitch detection using autocorrelation or FFT algorithm
- Display detected note, cents deviation, and visual indicator

**UI**:
- Circular or linear gauge showing cents deviation (-50 to +50)
- Current detected note name (e.g., "A4 - 440Hz")
- Green indicator when within ±5 cents of target pitch
- Optional reference tone playback for each string

**Technical**:
- Entirely client-side (no server communication needed)
- Works offline once loaded
- Low latency pitch detection (~50ms update rate)
