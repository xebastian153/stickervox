// StickerVox panel styles (MAIN world): CSS for the panel's shadow root.
// Tokens live on :host and mirror WhatsApp Web's light and dark surfaces; data-theme="dark"
// on the host switches the scheme. --sv-font is set inline on the host from WhatsApp's body font.
(function (root) {
  const SV = root.StickerVox;
  if (!SV) return;

  SV.uiStyles = `
:host {
  /* primitives */
  --sv-green-500: #00a884;
  --sv-green-600: #008069;
  --sv-ink-900: #111b21;
  --sv-ink-600: #54656f;
  --sv-paper-0: #ffffff;
  --sv-paper-100: #f0f2f5;
  --sv-paper-200: #e9edef;
  --sv-wall-light: #efeae2;
  --sv-night-950: #0b141a;
  --sv-night-900: #111b21;
  --sv-night-800: #202c33;
  --sv-night-700: #2a3942;
  --sv-night-300: #8696a0;
  --sv-night-50: #e9edef;
  --sv-red-600: #c62835;
  --sv-red-300: #f15c6d;
  --sv-amber-700: #9a5b00;
  --sv-amber-300: #f0b44c;

  /* semantic: light */
  --sv-canvas: var(--sv-paper-0);
  --sv-raised: var(--sv-paper-100);
  --sv-raised-hover: var(--sv-paper-200);
  --sv-overlay: var(--sv-paper-0);
  --sv-wallpaper: var(--sv-wall-light);
  --sv-text: var(--sv-ink-900);
  --sv-text-muted: var(--sv-ink-600);
  --sv-hairline: rgb(11 20 26 / 0.09);
  --sv-hairline-strong: rgb(11 20 26 / 0.16);
  --sv-accent: var(--sv-green-500);
  --sv-accent-fill: var(--sv-green-600);
  --sv-accent-ink: var(--sv-green-600);
  --sv-accent-contrast: var(--sv-paper-0);
  --sv-accent-soft: rgb(0 168 132 / 0.12);
  --sv-danger: var(--sv-red-600);
  --sv-danger-soft: rgb(198 40 53 / 0.08);
  --sv-warn: var(--sv-amber-700);
  --sv-focus: var(--sv-green-600);
  --sv-scrim: rgb(11 20 26 / 0.56);
  --sv-on-scrim: #ffffff;
  --sv-shadow-panel: 0 1px 2px rgb(11 20 26 / 0.08), 0 4px 12px rgb(11 20 26 / 0.06), 0 24px 56px -12px rgb(11 20 26 / 0.28);
  --sv-shadow-media: 0 1px 2px rgb(11 20 26 / 0.12), 0 12px 28px -10px rgb(11 20 26 / 0.35);
  --sv-shadow-thumb: 0 1px 3px rgb(11 20 26 / 0.25);
  --sv-check-a: #f4f5f6;
  --sv-check-b: #dfe3e6;
  --sv-sel: #ffffff;
  --sv-sel-halo: rgb(11 20 26 / 0.35);
  --sv-sel-ink: var(--sv-ink-900);
  --sv-preview-tile: #3b4a54;
  --sv-wall-dot: rgb(11 20 26 / 0.06);
  --sv-on-wall: var(--sv-paper-0);
  --sv-stamp-bg: var(--sv-scrim);
  --sv-ht-tile: var(--sv-paper-0);
  --sv-ht-dot: var(--sv-green-600);
  --sv-pill-bg: rgb(17 27 33 / 0.88);
  --sv-pill-ink: var(--sv-paper-0);
  --sv-shadow-tile: 0 1px 2px rgb(11 20 26 / 0.06), 0 10px 28px -10px rgb(11 20 26 / 0.22);
  --sv-shadow-sticker: drop-shadow(0 1px 1.5px rgb(11 20 26 / 0.16)) drop-shadow(0 10px 14px rgb(11 20 26 / 0.16));

  /* scale */
  --sv-radius-sm: 8px;
  --sv-radius-md: 12px;
  --sv-radius-lg: 16px;
  --sv-radius-full: 999px;
  --sv-space-1: 4px;
  --sv-space-2: 8px;
  --sv-space-3: 12px;
  --sv-space-4: 16px;
  --sv-space-5: 24px;
  --sv-space-6: 32px;
  --sv-text-sm: 13px;
  --sv-text-md: 14px;
  --sv-text-lg: 16px;
  --sv-text-xl: 20px;
  --sv-target: 36px;
  --sv-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --sv-fast: 150ms;

  all: initial;
  position: fixed;
  inset-block-start: 12px;
  inset-inline-end: 12px;
  z-index: 2147483000;
  color-scheme: light;
}
:host([data-theme="dark"]) {
  --sv-canvas: var(--sv-night-900);
  --sv-raised: var(--sv-night-800);
  --sv-raised-hover: var(--sv-night-700);
  --sv-overlay: var(--sv-night-800);
  --sv-wallpaper: var(--sv-night-950);
  --sv-text: var(--sv-night-50);
  --sv-text-muted: var(--sv-night-300);
  --sv-hairline: rgb(233 237 239 / 0.08);
  --sv-hairline-strong: rgb(233 237 239 / 0.16);
  --sv-accent-fill: var(--sv-green-500);
  --sv-accent-ink: var(--sv-green-500);
  --sv-accent-contrast: var(--sv-night-900);
  --sv-accent-soft: rgb(0 168 132 / 0.16);
  --sv-danger: var(--sv-red-300);
  --sv-danger-soft: rgb(241 92 109 / 0.1);
  --sv-warn: var(--sv-amber-300);
  --sv-focus: var(--sv-green-500);
  --sv-shadow-panel: 0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px rgb(0 0 0 / 0.25), 0 24px 56px -12px rgb(0 0 0 / 0.7);
  --sv-shadow-media: 0 1px 2px rgb(0 0 0 / 0.5), 0 12px 28px -10px rgb(0 0 0 / 0.8);
  --sv-check-a: #2a3942;
  --sv-check-b: #202c33;
  --sv-preview-tile: #0b141a;
  --sv-wall-dot: rgb(233 237 239 / 0.045);
  --sv-on-wall: var(--sv-night-800);
  --sv-stamp-bg: rgb(42 57 66 / 0.92);
  --sv-ht-tile: var(--sv-night-800);
  --sv-ht-dot: var(--sv-green-500);
  --sv-pill-bg: rgb(233 237 239 / 0.94);
  --sv-pill-ink: var(--sv-night-900);
  --sv-shadow-tile: 0 1px 2px rgb(0 0 0 / 0.4), 0 10px 28px -10px rgb(0 0 0 / 0.65);
  --sv-shadow-sticker: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.45)) drop-shadow(0 10px 16px rgb(0 0 0 / 0.4));
  color-scheme: dark;
}
:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; }
svg { display: block; flex: none; }
[hidden] { display: none !important; }

/* ---------- shell ---------- */
.panel {
  inline-size: min(400px, calc(100vw - 24px));
  block-size: min(780px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  background: var(--sv-canvas);
  color: var(--sv-text);
  font-family: var(--sv-font, "Segoe UI", system-ui, sans-serif);
  font-size: var(--sv-text-md);
  line-height: 1.4;
  border: 1px solid var(--sv-hairline);
  border-radius: var(--sv-radius-lg);
  box-shadow: var(--sv-shadow-panel);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.header {
  display: grid;
  grid-template-columns: var(--sv-target) 1fr var(--sv-target);
  align-items: center;
  gap: var(--sv-space-2);
  padding: var(--sv-space-3) var(--sv-space-3) var(--sv-space-2);
}
.header-main { display: grid; justify-items: center; gap: 6px; min-inline-size: 0; }
.title { margin: 0; font-size: var(--sv-text-lg); font-weight: 600; letter-spacing: -0.01em; }
.steps {
  display: flex;
  align-items: center;
  gap: var(--sv-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--sv-text-sm);
  color: var(--sv-text-muted);
}
.steps li { display: inline-flex; align-items: center; gap: 6px; }
.steps li + li::before {
  content: "";
  inline-size: 14px;
  block-size: 1px;
  background: var(--sv-hairline-strong);
  margin-inline-end: 2px;
}
.step-num {
  display: inline-grid;
  place-items: center;
  inline-size: 18px;
  block-size: 18px;
  border-radius: var(--sv-radius-full);
  border: 1px solid var(--sv-hairline-strong);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.steps li[aria-current="step"] { color: var(--sv-text); font-weight: 600; }
.steps li[aria-current="step"] .step-num { background: var(--sv-accent-fill); border-color: transparent; color: var(--sv-accent-contrast); }
.steps li[data-done="true"] .step-num { color: var(--sv-accent-ink); border-color: currentColor; }
.header .icon-btn[data-invisible="true"] { visibility: hidden; }

.body {
  position: relative;
  flex: 1;
  min-block-size: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  border-block-start: 1px solid var(--sv-hairline);
}
.view { padding: var(--sv-space-4); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sv-space-4); align-content: start; }
.view[data-step="1"] { min-block-size: 100%; grid-template-rows: 1fr auto; align-content: stretch; }
.view[data-step="3"] { min-block-size: 100%; align-content: stretch; }
/* Step 2 keeps the preview on screen: only the tab panel scrolls, the stage shrinks to fit. */
.view[data-step="2"] { display: flex; flex-direction: column; gap: 8px; block-size: 100%; min-block-size: 540px; }
.view[data-step="2"] > * { flex: none; min-inline-size: 0; }
.footer {
  display: flex;
  gap: var(--sv-space-2);
  padding: var(--sv-space-3) var(--sv-space-4) var(--sv-space-4);
  border-block-start: 1px solid var(--sv-hairline);
  background: var(--sv-canvas);
}
.footer > * { flex: 1; min-inline-size: 0; }
.btn .label { overflow: hidden; text-overflow: ellipsis; }

/* ---------- type ---------- */
.h-xl { margin: 0; font-size: var(--sv-text-xl); font-weight: 600; letter-spacing: -0.015em; line-height: 1.2; text-wrap: balance; }
.muted { color: var(--sv-text-muted); }
.small { font-size: var(--sv-text-sm); }
.num { font-variant-numeric: tabular-nums; }
.sr-only {
  position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; margin: -1px;
}
p { margin: 0; }

/* ---------- buttons ---------- */
button {
  font: inherit;
  color: inherit;
  margin: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sv-space-2);
  min-block-size: 40px;
  padding: 0 var(--sv-space-4);
  border: 0;
  border-radius: var(--sv-radius-full);
  font-size: var(--sv-text-md);
  font-weight: 600;
  white-space: nowrap;
  transition: background-color var(--sv-fast) ease, transform 90ms ease;
}
.btn:active:not(:disabled) { transform: scale(0.97); }
.btn-primary { background: var(--sv-accent-fill); color: var(--sv-accent-contrast); }
.btn-primary:hover:not(:disabled) { background: var(--sv-accent); }
.btn-secondary { background: var(--sv-raised); color: var(--sv-text); }
.btn-secondary:hover:not(:disabled) { background: var(--sv-raised-hover); }
.btn-quiet { background: transparent; color: var(--sv-accent-ink); padding-inline: var(--sv-space-3); }
.btn-quiet:hover:not(:disabled) { background: var(--sv-accent-soft); }
.btn-lg { min-block-size: 48px; font-size: var(--sv-text-lg); padding-inline: var(--sv-space-5); }
.btn-sm { min-block-size: 32px; padding: 0 var(--sv-space-3); font-size: var(--sv-text-sm); }
.btn:disabled { cursor: default; opacity: 0.45; }
.btn[aria-busy="true"] { opacity: 1; }

.icon-btn {
  display: inline-grid;
  place-items: center;
  inline-size: var(--sv-target);
  block-size: var(--sv-target);
  padding: 0;
  border: 0;
  border-radius: var(--sv-radius-full);
  background: transparent;
  color: var(--sv-text-muted);
  transition: background-color var(--sv-fast) ease, transform 90ms ease;
}
.icon-btn:hover:not(:disabled) { background: var(--sv-raised); }
.icon-btn:active:not(:disabled) { transform: scale(0.94); }
.icon-btn:disabled { opacity: 0.4; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { background: var(--sv-danger-soft); color: var(--sv-danger); }

:focus { outline: none; }
[tabindex="-1"]:focus-visible { outline: none; }
:focus-visible { outline: 2px solid var(--sv-focus); outline-offset: 2px; }

/* ---------- step 1: video ---------- */
.drop {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--sv-space-4);
  min-block-size: 360px;
  padding: var(--sv-space-6) var(--sv-space-5);
  border-radius: var(--sv-radius-lg);
  border: 1.5px dashed var(--sv-hairline-strong);
  background: var(--sv-raised);
  text-align: center;
  transition: border-color var(--sv-fast) ease;
}
.drop[data-over="true"] { border-color: var(--sv-accent); }
.drop[data-over="true"] .drop-art { transform: translateY(-4px) scale(1.04); }
.drop-art {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: 88px;
  block-size: 88px;
  margin-block-end: var(--sv-space-2);
  border-radius: 28px;
  background: var(--sv-canvas);
  color: var(--sv-accent-ink);
  box-shadow: var(--sv-shadow-media);
  transition: transform 220ms var(--sv-ease);
}
.drop-art .badge {
  position: absolute;
  inset-block-end: -6px;
  inset-inline-end: -6px;
  display: grid;
  place-items: center;
  inline-size: 30px;
  block-size: 30px;
  border-radius: var(--sv-radius-full);
  background: var(--sv-accent-fill);
  color: var(--sv-accent-contrast);
  box-shadow: 0 0 0 3px var(--sv-raised);
}
.drop-copy { display: grid; gap: 6px; max-inline-size: 280px; }
.drop-actions { display: grid; justify-items: center; gap: var(--sv-space-2); }
.drop-meta { font-size: var(--sv-text-sm); color: var(--sv-text-muted); }
.resume {
  display: flex;
  align-items: center;
  gap: var(--sv-space-3);
  padding: var(--sv-space-2) var(--sv-space-2) var(--sv-space-2) var(--sv-space-3);
  border-radius: var(--sv-radius-md);
  background: var(--sv-raised);
}
.resume .grow { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resume > .btn { flex: none; }

/* ---------- inline notices ---------- */
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--sv-space-2);
  padding: var(--sv-space-3);
  border-radius: var(--sv-radius-md);
  background: var(--sv-danger-soft);
  color: var(--sv-text);
  font-size: var(--sv-text-md);
  text-align: start;
}
.notice svg { color: var(--sv-danger); margin-block-start: 1px; }
.notice .grow { flex: 1; display: grid; gap: var(--sv-space-2); justify-items: start; }
.notice-actions { display: flex; gap: var(--sv-space-2); flex-wrap: wrap; }
.notice .btn { background: var(--sv-canvas); }

/* ---------- step 2: edit bar ---------- */
.editbar { display: flex; align-items: center; justify-content: space-between; gap: var(--sv-space-2); margin-block: -6px -2px; }
.editbar-group { display: flex; align-items: center; gap: var(--sv-space-2); font-size: var(--sv-text-sm); }
.editbar .icon-btn { color: var(--sv-text); }
.editbar .play { background: var(--sv-raised); }
.editbar .play:hover:not(:disabled) { background: var(--sv-raised-hover); }
.editbar .icon-btn:disabled { color: var(--sv-text-muted); }

/* ---------- step 2: stage ---------- */
.view[data-step="2"] > .stage-wrap { flex: 1 1 0; min-block-size: 224px; container-type: size; display: grid; place-items: center; }
.stage {
  position: relative;
  inline-size: min(calc(100cqw - 16px), calc(100cqh - 8px));
  aspect-ratio: 1;
  isolation: isolate;
}
/* Transparent output pixels show through as a checkerboard, like an image editor. */
.stage canvas {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  border-radius: var(--sv-radius-md);
  background-color: var(--sv-check-a);
  background-image: conic-gradient(var(--sv-check-b) 25%, transparent 0 50%, var(--sv-check-b) 0 75%, transparent 0);
  background-size: 20px 20px;
  box-shadow: var(--sv-shadow-media);
  cursor: grab;
  touch-action: none;
}
.stage:not([data-shape="square"]) canvas, .stage[data-outline="true"] canvas { box-shadow: 0 0 0 1px var(--sv-hairline); }
.stage canvas.dragging { cursor: grabbing; }

/* selection box */
.sel {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  border: 1.5px solid var(--sv-sel);
  border-radius: 6px;
  box-shadow: 0 0 0 1px var(--sv-sel-halo), inset 0 0 0 1px var(--sv-sel-halo);
  pointer-events: none;
  z-index: 2;
}
.sel[data-offscreen="true"] { border-style: dashed; opacity: 0.75; }
.sel-ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sv-sel);
  font-family: Impact, "Arial Black", sans-serif;
  line-height: 1;
  opacity: 0.7;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
  white-space: nowrap;
}
.sel-del, .sel-size {
  position: absolute;
  display: grid;
  place-items: center;
  inline-size: 32px;
  block-size: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  touch-action: none;
}
.sel-del { inset-block-start: -16px; inset-inline-end: -16px; color: var(--sv-sel-ink); }
.sel-del::before, .sel-size::before {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: var(--sv-radius-full);
  background: var(--sv-sel);
  box-shadow: var(--sv-shadow-thumb);
  transition: transform 90ms ease;
}
.sel-del svg { position: relative; }
.sel-del:hover::before { transform: scale(1.08); }
.sel-del:active::before { transform: scale(0.92); }
.sel-size { inset-block-end: -16px; inset-inline-end: -16px; cursor: nwse-resize; }
.sel-size::before { inset: 9px; border: 2.5px solid var(--sv-accent); }
.sel-del:focus-visible { outline-offset: -2px; border-radius: var(--sv-radius-full); }
.stage-hint {
  position: absolute;
  inset-block-start: var(--sv-space-3);
  inset-inline: 0;
  margin-inline: auto;
  inline-size: max-content;
  max-inline-size: calc(100% - 24px);
  padding: 4px 10px;
  border-radius: var(--sv-radius-full);
  background: var(--sv-scrim);
  color: var(--sv-on-scrim);
  font-size: var(--sv-text-sm);
  pointer-events: none;
  transition: opacity 240ms ease;
}
.stage-hint[data-gone="true"] { opacity: 0; }

/* ---------- step 2: timeline ---------- */
.timeline { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sv-space-2); }
.track {
  position: relative;
  block-size: 44px;
  border-radius: var(--sv-radius-sm);
  touch-action: none;
  cursor: pointer;
  user-select: none;
}
.film {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  border-radius: var(--sv-radius-sm);
  background: var(--sv-raised);
}
.shade {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 100%;
  background: rgb(11 20 26 / 0.62);
  transform-origin: left center;
  pointer-events: none;
}
.shade.left { border-start-start-radius: var(--sv-radius-sm); border-end-start-radius: var(--sv-radius-sm); }
.shade.right { border-start-end-radius: var(--sv-radius-sm); border-end-end-radius: var(--sv-radius-sm); transform-origin: right center; }
.window {
  position: absolute;
  inset-block: -2px;
  inset-inline-start: 0;
  inline-size: 100%;
  border-block: 2px solid var(--sv-accent);
  transform-origin: left center;
  pointer-events: none;
}
.handle {
  position: absolute;
  inset-block: -2px;
  inset-inline-start: 0;
  inline-size: 24px;
  display: grid;
  place-items: center;
  background: var(--sv-accent);
  color: var(--sv-night-900);
  cursor: ew-resize;
  touch-action: none;
  transition: background-color var(--sv-fast) ease;
}
.handle::after { content: ""; inline-size: 2px; block-size: 16px; border-radius: 1px; background: currentColor; opacity: 0.7; }
.handle.start { border-start-start-radius: 8px; border-end-start-radius: 8px; }
.handle.end { border-start-end-radius: 8px; border-end-end-radius: 8px; }
/* 24px keyboard/a11y target; the visible playhead is the 2px line drawn by ::after. */
.playhead {
  position: absolute;
  inset-block: -6px;
  inset-inline-start: 0;
  inline-size: 24px;
  margin-inline-start: -12px;
  border-radius: var(--sv-radius-sm);
  pointer-events: none;
}
.playhead::after {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: 11px;
  inline-size: 2px;
  border-radius: 1px;
  background: #fff;
  box-shadow: var(--sv-shadow-thumb);
}
.playhead::before {
  content: "";
  position: absolute;
  inset-block-start: -3px;
  inset-inline-start: 7px;
  inline-size: 10px;
  block-size: 10px;
  border-radius: var(--sv-radius-full);
  background: #fff;
  box-shadow: var(--sv-shadow-thumb);
}
.track-wrap { padding-inline: 24px; }
/* Time ruler above the filmstrip (S12): its own row, so no label sits under a handle. */
.ruler { position: relative; block-size: 22px; /* label 0-12px, the playhead knob may rise into 13-22px */ color: var(--sv-text-muted); pointer-events: none; }
.ruler .tick {
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 0;
  inline-size: 1px;
  block-size: 3px;
  margin-inline-start: -0.5px;
  background: var(--sv-hairline-strong);
}
.ruler .tick.major { block-size: 5px; background: var(--sv-text-muted); opacity: 0.6; }
.ruler .tick-label.pin { color: var(--sv-accent-ink); font-weight: 600; }
.ruler .tick-label {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 12px;
  text-align: center;
  white-space: nowrap;
}
.playhead:focus-visible { outline-offset: 3px; }

/* ---------- step 2: whole-video overview (long videos, S11) ---------- */
/* A 4px rail inside a 24px hit area; the soft band is the zoomed filmstrip, the solid mark the clip. */
.ov { display: grid; gap: 2px; margin-block-end: var(--sv-space-2); }
.ov-track {
  position: relative;
  block-size: 24px;
  border-radius: var(--sv-radius-sm);
  cursor: pointer;
  touch-action: none;
  user-select: none;
}
.ov-track::before {
  content: "";
  position: absolute;
  inset-inline: 0;
  inset-block: 10px;
  border-radius: 2px;
  background: var(--sv-hairline-strong);
  transition: background-color var(--sv-fast) ease;
}
.ov-track:hover::before { background: var(--sv-text-muted); }
.ov-view {
  position: absolute;
  inset-block: 6px;
  border-radius: 4px;
  background: var(--sv-accent-soft);
  box-shadow: inset 0 0 0 1px var(--sv-hairline-strong);
  pointer-events: none;
}
.ov-sel {
  position: absolute;
  inset-block: 4px;
  min-inline-size: 6px;
  border-radius: 3px;
  background: var(--sv-accent);
  box-shadow: var(--sv-shadow-thumb);
  pointer-events: none;
}
.ov-labels {
  display: flex;
  justify-content: space-between;
  gap: var(--sv-space-2);
  font-size: 11px;
  line-height: 1.3;
  color: var(--sv-text-muted);
}
.ov-range { color: var(--sv-text); font-weight: 600; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--sv-radius-full);
  background: var(--sv-raised);
  color: var(--sv-text);
  font-size: var(--sv-text-sm);
  font-variant-numeric: tabular-nums;
}
.chip .muted { font-weight: 400; }
.chip strong { font-weight: 600; }

/* ---------- step 2: clip length + smoothness estimate (S13) ---------- */
.clip-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--sv-space-2); padding-inline: 24px; min-inline-size: 0; }
.clip-meta > .chip { flex: none; }
.est { --est-ink: var(--sv-text-muted); min-inline-size: 0; color: var(--sv-text); background: transparent; box-shadow: inset 0 0 0 1px var(--sv-hairline); transition: box-shadow var(--sv-fast) var(--sv-ease); }
.est-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.est[data-level="pending"] { color: var(--sv-text-muted); }
.est[data-level="great"], .est[data-level="good"] { --est-ink: var(--sv-accent-ink); }
.est[data-level="low"] { --est-ink: var(--sv-warn); }
.est[data-level="none"] { --est-ink: var(--sv-danger); background: var(--sv-danger-soft); box-shadow: none; }
/* Signal-style meter: the bar count carries the level next to the word, never color alone. */
.est-bars { display: inline-flex; align-items: flex-end; gap: 2px; block-size: 11px; flex: none; }
.est-bars i { inline-size: 3px; block-size: var(--h); border-radius: 1px; background: currentColor; opacity: 0.22; color: var(--sv-text-muted); }
.est-bars i[data-on="true"] { opacity: 1; color: var(--est-ink); }
.est[data-level="none"] .est-bars { display: none; }
.est[data-level="none"] .est-text::before { content: "!"; display: inline-grid; place-items: center; inline-size: 14px; block-size: 14px; margin-inline-end: 6px; border-radius: 50%; background: var(--sv-danger); color: var(--sv-canvas); font-size: 10px; font-weight: 700; vertical-align: 1px; }
.est[data-level="pending"] .est-bars i { animation: sv-pulse 1.2s ease-in-out infinite; }
.est[data-level="pending"] .est-bars i:nth-child(2) { animation-delay: 0.15s; }
.est[data-level="pending"] .est-bars i:nth-child(3) { animation-delay: 0.3s; }
.est[data-level="pending"] .est-bars i:nth-child(4) { animation-delay: 0.45s; }

/* ---------- step 2: layer tracks ---------- */
.lt { margin-block-start: 6px; max-block-size: 66px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
.lt-list { position: relative; list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.lt-row {
  position: relative;
  block-size: 32px;
  border-radius: var(--sv-radius-sm);
  background: var(--sv-raised);
}
.lt-body {
  position: absolute;
  inset-block: 3px;
  display: flex;
  align-items: center;
  min-inline-size: 6px;
  padding: 0 8px;
  border: 1px solid var(--sv-hairline-strong);
  border-radius: 6px;
  background: var(--sv-canvas);
  color: var(--sv-text-muted);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  transition: background-color var(--sv-fast) ease, color var(--sv-fast) ease;
}
.lt-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lt-row[data-live="true"] .lt-body { color: var(--sv-text); }
.lt-row[data-selected="true"] .lt-body { background: var(--sv-accent-soft); border-color: var(--sv-accent); color: var(--sv-text); }
.lt-body:active { cursor: grabbing; }
.lt-body:focus-visible { outline-offset: 1px; }
/* 32px hit area centered on each bar edge; only the selected bar shows its grips. */
.lt-grip {
  position: absolute;
  inset-block: 0;
  inline-size: 32px;
  margin-inline-start: -16px;
  display: none;
  place-items: center;
  cursor: ew-resize;
  touch-action: none;
  z-index: 1;
}
.lt-grip::after { content: ""; inline-size: 6px; block-size: 16px; border-radius: 3px; background: var(--sv-accent); box-shadow: 0 0 0 2px var(--sv-canvas); }
.lt-row[data-selected="true"] .lt-grip { display: grid; }
.lt-grip:focus-visible { outline-offset: -2px; border-radius: 6px; }
.lt-head {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 2px;
  margin-inline-start: -1px;
  border-radius: 1px;
  background: var(--sv-text);
  opacity: 0.55;
  pointer-events: none;
  z-index: 2;
}
.lt-actions { display: flex; align-items: center; gap: var(--sv-space-2); padding-inline: 24px; }
.lt-sel-name { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--sv-text-sm); color: var(--sv-text-muted); }

/* ---------- step 2: tool bar ---------- */
.tools {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: var(--sv-radius-md);
  background: var(--sv-raised);
}
.tool {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 2px;
  min-block-size: 46px;
  padding: 3px 2px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--sv-text-muted);
  font-size: 12px;
  font-weight: 500;
  transition: background-color var(--sv-fast) ease, color var(--sv-fast) ease;
}
.tool:hover { color: var(--sv-text); }
.tool[aria-selected="true"] {
  background: var(--sv-canvas);
  color: var(--sv-accent-ink);
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(11 20 26 / 0.12), 0 0 0 1px var(--sv-hairline);
}
:host([data-theme="dark"]) .tool[aria-selected="true"] { background: var(--sv-night-700); }
.tool:active { transform: scale(0.96); }

.tabpanel { display: grid; gap: var(--sv-space-2); align-content: start; }
.tabpanel .switch-row { padding: var(--sv-space-2) var(--sv-space-3); }
.view[data-step="2"] > .tabpanel { flex: 0 1 auto; min-block-size: 84px; max-block-size: 31%; overflow-x: hidden; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding: 3px; margin: -3px; }
.hint { font-size: var(--sv-text-sm); color: var(--sv-text-muted); }

/* framing */
.zoom-row { display: flex; align-items: center; gap: var(--sv-space-1); }
.zoom-row .btn { margin-inline-start: var(--sv-space-2); }
.slider {
  flex: 1;
  min-inline-size: 0;
  appearance: none;
  -webkit-appearance: none;
  block-size: var(--sv-target);
  margin: 0;
  background: transparent;
  cursor: pointer;
}
.slider::-webkit-slider-runnable-track {
  block-size: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--sv-accent) 0 var(--fill, 0%), var(--sv-hairline-strong) var(--fill, 0%));
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  inline-size: 18px;
  block-size: 18px;
  margin-block-start: -7px;
  border-radius: var(--sv-radius-full);
  background: #fff;
  box-shadow: var(--sv-shadow-thumb), 0 0 0 1px rgb(11 20 26 / 0.08);
  transition: transform var(--sv-fast) ease;
}
.slider:active::-webkit-slider-thumb { transform: scale(1.15); }
.slider::-moz-range-track { block-size: 4px; border-radius: 2px; background: var(--sv-hairline-strong); }
.slider::-moz-range-progress { block-size: 4px; border-radius: 2px; background: var(--sv-accent); }
.slider::-moz-range-thumb { inline-size: 18px; block-size: 18px; border: 0; border-radius: 50%; background: #fff; box-shadow: var(--sv-shadow-thumb); }

/* text tool */
.text-edit { display: flex; align-items: center; gap: var(--sv-space-2); }
.layer-input {
  flex: 1;
  min-inline-size: 0;
  min-block-size: 40px;
  padding: 0 var(--sv-space-3);
  border: 1px solid var(--sv-hairline-strong);
  border-radius: var(--sv-radius-sm);
  background: var(--sv-canvas);
  color: var(--sv-text);
  font: inherit;
  font-size: var(--sv-text-lg);
  font-weight: 600;
}
.layer-input::placeholder { color: var(--sv-text-muted); font-weight: 400; }
.layer-input:focus-visible { outline: 2px solid var(--sv-focus); outline-offset: 0; border-color: transparent; }
.style-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.style-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-block-size: 36px;
  padding: 0 4px;
  border: 1px solid var(--sv-hairline);
  border-radius: var(--sv-radius-sm);
  background: var(--sv-canvas);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  transition: border-color var(--sv-fast) ease, background-color var(--sv-fast) ease;
}
.style-chip:hover { border-color: var(--sv-hairline-strong); }
.style-chip[aria-pressed="true"] { border-color: var(--sv-accent); background: var(--sv-accent-soft); font-weight: 600; }
.style-chip > span:last-child { max-inline-size: 100%; overflow: hidden; text-overflow: ellipsis; }
/* Tiny previews of each preset; meme and shadow sit on a dark "video" tile. */
.style-prev {
  display: grid;
  place-items: center;
  flex: none;
  inline-size: 24px;
  block-size: 20px;
  border-radius: 5px;
  background: var(--sv-preview-tile);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}
.style-prev[data-style="meme"] { font-family: Impact, "Arial Black", sans-serif; font-weight: 400; font-size: 13px; -webkit-text-stroke: 2.5px #000; paint-order: stroke fill; }
.style-prev[data-style="shadow"] { text-shadow: 0 1px 4px rgb(0 0 0 / 0.9); }
.style-prev[data-style="bubble"] { background: #fff; color: #111b21; border-radius: var(--sv-radius-full); box-shadow: inset 0 0 0 1px rgb(11 20 26 / 0.16); }
.style-prev[data-style="label"] { background: #008069; color: #fff; border-radius: 5px; }
.color-row { display: flex; flex-wrap: wrap; gap: 2px; }
.swatch {
  position: relative;
  inline-size: 34px;
  block-size: 34px;
  padding: 0;
  border: 0;
  border-radius: var(--sv-radius-full);
  background: transparent;
}
.swatch::before {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: var(--sv-radius-full);
  background: var(--swatch);
  box-shadow: inset 0 0 0 1px var(--sv-hairline-strong);
  transition: transform var(--sv-fast) ease;
}
.swatch:hover::before { transform: scale(1.08); }
.swatch[aria-pressed="true"]::after {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: var(--sv-radius-full);
  border: 2px solid var(--sv-accent);
}
.text-start { display: flex; align-items: center; justify-content: space-between; gap: var(--sv-space-3); }

/* emoji tool */
.emoji-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; }
.emoji-btn {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-block-size: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--sv-radius-sm);
  background: transparent;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  font-size: 24px;
  line-height: 1;
  transition: background-color var(--sv-fast) ease, transform 90ms ease;
}
.emoji-btn:hover { background: var(--sv-raised); }
.emoji-btn:active { transform: scale(0.9); }

/* shape tool */
.shape-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sv-space-2); }
.shape-opt {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sv-space-2);
  min-block-size: 40px;
  padding: 0 var(--sv-space-2);
  border: 1px solid var(--sv-hairline);
  border-radius: var(--sv-radius-md);
  background: var(--sv-canvas);
  font-size: var(--sv-text-sm);
  font-weight: 500;
  transition: border-color var(--sv-fast) ease, background-color var(--sv-fast) ease;
}
.shape-opt:hover { border-color: var(--sv-hairline-strong); }
.shape-opt[aria-checked="true"] { border-color: var(--sv-accent); background: var(--sv-accent-soft); font-weight: 600; }
.shape-glyph { flex: none; inline-size: 18px; block-size: 18px; background: var(--sv-text-muted); }
.shape-opt[aria-checked="true"] .shape-glyph { background: var(--sv-accent-ink); }
.shape-glyph[data-shape="square"] { border-radius: 2px; }
.shape-glyph[data-shape="rounded"] { border-radius: 6px; }
.shape-glyph[data-shape="circle"] { border-radius: var(--sv-radius-full); }

/* switch */
.switch-row {
  display: flex;
  align-items: center;
  gap: var(--sv-space-3);
  padding: var(--sv-space-3) var(--sv-space-4);
  border-radius: var(--sv-radius-md);
  background: var(--sv-raised);
}
.switch-row .grow { flex: 1; display: grid; gap: 2px; }
.switch-row strong { font-weight: 600; }
.switch {
  position: relative;
  flex: none;
  inline-size: 44px;
  block-size: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--sv-radius-full);
  background: var(--sv-hairline-strong);
  transition: background-color 180ms ease;
}
.switch::after {
  content: "";
  position: absolute;
  inset-block-start: 3px;
  inset-inline-start: 3px;
  inline-size: 20px;
  block-size: 20px;
  border-radius: var(--sv-radius-full);
  background: #fff;
  box-shadow: var(--sv-shadow-thumb);
  transition: transform 180ms var(--sv-ease);
}
.switch[aria-checked="true"] { background: var(--sv-accent); }
.switch[aria-checked="true"]::after { transform: translateX(18px); }

/* ---------- step 3: send ---------- */
/* Chat backdrop: the wallpaper plus a faint dot pattern of our own, echoing the halftone. */
.chatview {
  position: relative;
  display: grid;
  justify-items: center;
  gap: var(--sv-space-3);
  padding: var(--sv-space-5) var(--sv-space-4) var(--sv-space-3);
  border-radius: var(--sv-radius-md);
  background:
    radial-gradient(circle at center, var(--sv-wall-dot) 0 1px, transparent 1.5px) 0 0 / 16px 16px,
    var(--sv-wallpaper);
  overflow: hidden;
}
.sticker {
  position: relative;
  inline-size: 168px;
  block-size: 168px;
}
.sticker img { inline-size: 100%; block-size: 100%; object-fit: contain; display: block; filter: var(--sv-shadow-sticker); }
.sticker .stamp {
  position: absolute;
  inset-block-end: 6px;
  inset-inline-end: 6px;
  display: inline-grid;
  place-items: center;
  inline-size: 22px;
  block-size: 22px;
  border-radius: var(--sv-radius-full);
  background: var(--sv-stamp-bg);
  color: var(--sv-on-scrim);
}
/* The square where the dots emerge and the sticker lands: same box, so nothing jumps. */
.result-stage { position: relative; inline-size: 200px; aspect-ratio: 1; }
.result-stage > * { position: absolute; inset: 0; }
.result-stage .sticker { inline-size: 100%; block-size: 100%; }
.build-progress { border-radius: 18px; box-shadow: var(--sv-shadow-tile); transition: box-shadow 200ms ease; }
.build-progress[data-resolving="true"] { box-shadow: none; }
.halftone { display: block; inline-size: 100%; block-size: 100%; border-radius: 18px; }
.build-pill {
  position: absolute;
  inset-block-end: 12px;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  min-inline-size: 48px;
  padding: 3px 10px;
  border-radius: var(--sv-radius-full);
  background: var(--sv-pill-bg);
  color: var(--sv-pill-ink);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  box-shadow: var(--sv-shadow-thumb);
  transition: opacity 160ms ease;
}
.build-progress[data-resolving="true"] .build-pill { opacity: 0; }
/* One fixed-height row: the phase while building, the actions once ready. */
.stage-foot { min-block-size: var(--sv-target); display: grid; place-items: center; }
.build-phase { font-size: var(--sv-text-sm); color: var(--sv-text-muted); text-align: center; }
.result-actions { display: flex; align-items: center; gap: var(--sv-space-3); }
.btn-pill { background: var(--sv-on-wall); color: var(--sv-text); box-shadow: var(--sv-shadow-thumb); }
.btn-pill:hover:not(:disabled) { background: var(--sv-raised-hover); }
.btn-pill svg { color: var(--sv-accent-ink); }
.result-meta { font-size: 12px; color: var(--sv-text-muted); }
.send-main { display: grid; gap: var(--sv-space-4); align-content: start; }
.chatview > .notice { justify-self: stretch; }
@keyframes sv-pulse { 50% { opacity: 0.35; } }

.picker { display: grid; gap: var(--sv-space-2); align-content: start; }
.picker-head { display: flex; align-items: baseline; justify-content: space-between; }
.picker-head h3 { margin: 0; font-size: var(--sv-text-md); font-weight: 600; }
.search {
  position: relative;
  display: flex;
  align-items: center;
}
.search svg { position: absolute; inset-inline-start: 12px; color: var(--sv-text-muted); pointer-events: none; }
.search input {
  inline-size: 100%;
  min-block-size: 40px;
  padding: 0 var(--sv-space-3) 0 40px;
  border: 0;
  border-radius: var(--sv-radius-sm);
  background: var(--sv-raised);
  color: var(--sv-text);
  font: inherit;
}
.search input::placeholder { color: var(--sv-text-muted); }
.search input::-webkit-search-cancel-button { cursor: pointer; }
.chats { list-style: none; margin: 0; padding: 0; display: grid; }
.chat {
  display: flex;
  align-items: center;
  gap: var(--sv-space-3);
  inline-size: 100%;
  min-block-size: 56px;
  padding: var(--sv-space-2);
  border: 0;
  border-radius: var(--sv-radius-md);
  background: transparent;
  text-align: start;
  transition: background-color 120ms ease;
}
.chat:hover { background: var(--sv-raised); }
.chat[aria-checked="true"] { background: var(--sv-accent-soft); }
.chat:focus-visible { outline-offset: -2px; }
.avatar {
  display: grid;
  place-items: center;
  flex: none;
  inline-size: 40px;
  block-size: 40px;
  border-radius: var(--sv-radius-full);
  background: oklch(50% 0.09 var(--hue, 160));
  color: #fff;
  font-size: var(--sv-text-md);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.avatar.self { background: var(--sv-accent-fill); color: var(--sv-accent-contrast); }
.chat-text { flex: 1; min-inline-size: 0; display: grid; }
.chat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.chat-meta { font-size: var(--sv-text-sm); color: var(--sv-text-muted); }
.chat .check { color: var(--sv-accent-ink); opacity: 0; transform: scale(0.6); transition: opacity 160ms ease, transform 200ms var(--sv-ease); }
.chat[aria-checked="true"] .check { opacity: 1; transform: none; }
.picker-state { display: flex; align-items: center; gap: var(--sv-space-2); padding: var(--sv-space-4) var(--sv-space-2); color: var(--sv-text-muted); }
.spinner {
  inline-size: 18px;
  block-size: 18px;
  border-radius: var(--sv-radius-full);
  border: 2px solid currentColor;
  border-inline-end-color: transparent;
  animation: sv-spin 0.8s linear infinite;
  flex: none;
}
@keyframes sv-spin { to { transform: rotate(360deg); } }

.success {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--sv-space-3);
  min-block-size: 100%;
  padding: var(--sv-space-6) var(--sv-space-5);
  text-align: center;
}
.success-badge {
  display: grid;
  place-items: center;
  inline-size: 80px;
  block-size: 80px;
  margin-block-end: var(--sv-space-2);
  border-radius: var(--sv-radius-full);
  background: var(--sv-accent-fill);
  color: var(--sv-accent-contrast);
  animation: sv-pop 420ms var(--sv-ease) both;
}
.success-badge svg { animation: sv-check 320ms 160ms var(--sv-ease) both; }
.success .sticker { inline-size: 120px; block-size: 120px; animation: sv-fade 300ms 80ms ease both; }
@keyframes sv-pop { from { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.05); } to { opacity: 1; transform: none; } }
@keyframes sv-check { from { opacity: 0; transform: scale(0.4) rotate(-12deg); } to { opacity: 1; transform: none; } }
@keyframes sv-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
  .btn:active, .icon-btn:active, .tool:active, .emoji-btn:active { transform: none !important; }
  .spinner { animation: sv-pulse 1.2s ease-in-out infinite !important; border-inline-end-color: currentColor; }
}
`;
})(globalThis);
