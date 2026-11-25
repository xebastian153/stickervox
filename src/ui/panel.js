// StickerVox panel (MAIN world): a three-step wizard (Video → Editar → Enviar) floating over
// WhatsApp Web, rendered in a Shadow DOM. Pure logic lives in StickerVox.uiModel; this file wires
// the DOM. User-provided text is always written with textContent, never innerHTML.
(function (root) {
  const SV = root.StickerVox;
  if (!SV) return;

  const doc = root.document;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const FALLBACK_MAX_CLIP_SEC = 15;
  const FALLBACK_SIZE = 512;
  const WA_POLL_MS = 1000;
  const MAX_CHAT_ROWS = 60;
  const PAN_STEP_RATIO = 0.04;
  const KEY_ZOOM = 1.1;
  const HANDLE_W = 24; // trim handle width (px), see .handle in styles.js
  const FILM_DEBOUNCE_MS = 250; // thumbnails regenerate this long after the zoom window moves
  const ESTIMATE_DEBOUNCE_MS = 400; // the smoothness estimate starts this long after the last edit (S13)
  const EASE = "cubic-bezier(.2,.8,.2,1)";
  const STEP_TITLES = { 1: "Nuevo sticker con sonido", 2: "Ajusta tu sticker", 3: "Envía tu sticker" };
  const STEP_LABELS = ["Video", "Editar", "Enviar"];
  const MAX_LAYERS = 8;
  const LAYER_KEY_STEP = 0.01;
  const LAYER_KEY_ZOOM = 1.08;
  const HIT_PAD = 0.02;
  const DRAG_SLOP = 0.006;
  const HINT_MS = 3200;
  const TEXT_STYLE_OPTIONS = [["meme", "Meme"], ["bubble", "Burbuja"], ["label", "Etiqueta"], ["shadow", "Sombra"]];
  const COLOR_OPTIONS = [
    ["#ffffff", "Blanco"],
    ["#111111", "Negro"],
    ["#ffd60a", "Amarillo"],
    ["#ff453a", "Rojo"],
    ["#ff6fb5", "Rosa"],
    ["#2f8cff", "Azul"],
    ["#008069", "Verde"],
    ["#8e5cf7", "Morado"],
  ];
  const EMOJI_OPTIONS = [
    ["😂", "Risa"], ["🤣", "Carcajada"], ["😍", "Enamorado"], ["😎", "Genial"], ["😭", "Llanto"], ["😡", "Enojo"],
    ["😱", "Susto"], ["🤔", "Pensando"], ["🙄", "Ojos en blanco"], ["😴", "Sueño"], ["🥳", "Fiesta"], ["🤯", "Mente explotada"],
    ["👍", "Me gusta"], ["👏", "Aplausos"], ["🙏", "Por favor"], ["💪", "Fuerza"], ["🔥", "Fuego"], ["❤️", "Corazón"],
    ["💯", "Cien"], ["✨", "Brillos"], ["💀", "Calavera"], ["🎉", "Celebración"], ["👀", "Ojos"], ["🤡", "Payaso"],
  ];
  const EMOJI_COLS = 8;
  const SHAPE_OPTIONS = [["square", "Cuadrado"], ["rounded", "Redondeado"], ["circle", "Círculo"]];

  const M = () => SV.uiModel;

  function requireMedia() {
    if (!SV.media) throw new Error("El módulo de video no está disponible. Recarga WhatsApp Web.");
    return SV.media;
  }
  function requireWa() {
    if (!SV.wa) throw new Error("El puente con WhatsApp Web no está disponible. Recarga la página.");
    return SV.wa;
  }
  const limits = () => (SV.media && SV.media.LIMITS) || {};
  const maxClipSec = () => limits().maxClipSec || FALLBACK_MAX_CLIP_SEC;
  const outputSize = () => limits().size || FALLBACK_SIZE;

  const round1 = (value) => Math.round(value * 10) / 10;
  const fmtSec = (value) => `${(Number.isFinite(value) ? value : 0).toFixed(1)} s`;
  const fmtBytes = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  const reducedMotion = () => Boolean(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Small DOM builder. "text" sets textContent; "on*" adds listeners; booleans toggle attributes.
  function el(tag, props, children) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "text") node.textContent = String(value);
      else if (key === "class") node.className = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children || []) if (child) node.append(child);
    return node;
  }

  // ---------- icons (original, 24×24, 2px stroke) ----------
  const FILL = { fill: "currentColor", stroke: "none" };
  const SPEAKER = ["path", { d: "M4 9.5v5h3.5l4.5 4v-13l-4.5 4z", ...FILL }];
  const ICONS = {
    back: [["path", { d: "M15 18l-6-6 6-6" }]],
    close: [["path", { d: "M6.5 6.5l11 11M17.5 6.5l-11 11" }]],
    play: [["path", { d: "M8 5.7v12.6a.8.8 0 0 0 1.2.7l10-6.3a.8.8 0 0 0 0-1.4l-10-6.3A.8.8 0 0 0 8 5.7z", ...FILL }]],
    pause: [
      ["rect", { x: 6.5, y: 5, width: 4, height: 14, rx: 1, ...FILL }],
      ["rect", { x: 13.5, y: 5, width: 4, height: 14, rx: 1, ...FILL }],
    ],
    volume: [SPEAKER, ["path", { d: "M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2" }]],
    muted: [SPEAKER, ["path", { d: "M16 9.5l5 5M21 9.5l-5 5" }]],
    plus: [["path", { d: "M12 5v14M5 12h14" }]],
    minus: [["path", { d: "M5 12h14" }]],
    trash: [["path", { d: "M4.5 7h15M9.5 7V5h5v2M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7" }]],
    search: [["circle", { cx: 11, cy: 11, r: 6.5 }], ["path", { d: "M16 16l4 4" }]],
    check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
    film: [["rect", { x: 3, y: 5, width: 18, height: 14, rx: 3.5 }], ["path", { d: "M10.2 9.3v5.4l4.6-2.7z", ...FILL }]],
    alert: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 7.5v5.5M12 16.4v.1" }]],
    person: [["circle", { cx: 12, cy: 9, r: 3.6 }], ["path", { d: "M5.5 19.5a6.5 6.5 0 0 1 13 0" }]],
    center: [["circle", { cx: 12, cy: 12, r: 3 }], ["path", { d: "M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" }]],
    undo: [["path", { d: "M9 14.5L4.5 10 9 5.5" }], ["path", { d: "M5 10h9.5a5 5 0 0 1 0 10H11" }]],
    redo: [["path", { d: "M15 14.5l4.5-4.5L15 5.5" }], ["path", { d: "M19 10H9.5a5 5 0 0 0 0 10H13" }]],
    frame: [
      ["path", { d: "M4 8.5v-3A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" }],
      ["rect", { x: 9, y: 9, width: 6, height: 6, rx: 1.2 }],
    ],
    text: [["path", { d: "M5.5 7.5V5h13v2.5M12 5v14M9 19h6" }]],
    emoji: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["path", { d: "M8.6 13.6a4 4 0 0 0 6.8 0" }], ["path", { d: "M9.3 9.4v.8M14.7 9.4v.8", "stroke-width": 2.4 }]],
    shape: [["rect", { x: 3.5, y: 3.5, width: 10.5, height: 10.5, rx: 2.5 }], ["circle", { cx: 15, cy: 15, r: 5.5 }]],
  };
  function icon(name, size) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    const px = String(size || 20);
    for (const [key, value] of Object.entries({ width: px, height: px, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) {
      svg.setAttribute(key, value);
    }
    for (const [tag, attrs] of ICONS[name] || []) {
      const part = doc.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, String(value));
      svg.append(part);
    }
    return svg;
  }
  // Swaps a button's content to icon + label without touching innerHTML.
  function setButton(button, iconName, label, size) {
    const parts = [];
    if (iconName === "spinner") parts.push(el("span", { class: "spinner", "aria-hidden": "true" }));
    else if (iconName) parts.push(icon(iconName, size || 18));
    if (label) parts.push(el("span", { class: "label", text: label }));
    button.replaceChildren(...parts);
  }

  // Web Animations helper: transform+opacity normally, opacity only with reduced motion.
  function animateIn(node, fromTransform, duration) {
    if (!node || typeof node.animate !== "function") return null;
    const reduce = reducedMotion();
    const from = reduce ? { opacity: 0 } : { opacity: 0, transform: fromTransform };
    const to = reduce ? { opacity: 1 } : { opacity: 1, transform: "none" };
    return node.animate([from, to], { duration: reduce ? 120 : duration, easing: EASE });
  }

  const state = {
    host: null,
    shadow: null,
    panel: null,
    refs: {},
    step: 1,
    tool: "frame",
    loaded: null, // { video, url, duration, width, height }
    file: null,
    loading: false,
    loadError: "",
    range: { start: 0, end: 0 },
    crop: null,
    layers: [], // Layer[] in z-order, last on top (see StickerVox.uiModel)
    layersNorm: [],
    nextLayerId: 1,
    selectedId: null,
    shape: "square",
    outline: false,
    history: null,
    stageW: 0,
    layerDrag: null, // { id, pointerId, mode: "move" | "resize", ... }
    trackDrag: null, // { id, part, pointerId, startX, times, wasPlaying }
    tracksKey: "",
    overlayKey: "",
    hintTimer: 0,
    layerHintShown: false,
    normalize: true,
    editVersion: 0,
    viewVersion: 0,
    building: false,
    buildError: "",
    result: null, // { webp, audio, durationSec, webpUrl, audioUrl, version }
    chats: [],
    chatId: null,
    waReady: false,
    waError: "",
    waTimer: null,
    sending: false,
    sendError: "",
    sent: false,
    sentTo: "",
    rafId: 0,
    drawKey: "",
    drawWarned: false,
    pointers: new Map(),
    pinchDist: 0,
    hintGone: false,
    trackW: 0,
    scrub: null, // { id, wasPlaying }
    handleDrag: null, // { id, which, wasPlaying }
    pendingSeek: null,
    timeText: "",
    liveKey: "",
    thumbToken: 0,
    thumbsFor: null, // { loaded, start, end } of the thumbnails on the filmstrip
    filmWin: { start: 0, end: 0 }, // slice of the video the filmstrip shows (S11 zoom)
    filmTimer: 0,
    ovDrag: null, // { id, grab, wasPlaying } while dragging on the overview bar
    buildPhase: "",
    ht: null, // halftone build progress: { data, samples, shown, target, ceiling, finishing, resolveAt, done, ... }
    htRaf: 0,
    htLast: 0,
    rulerKey: "",
    rulerCharPx: 0,
    wasPlaying: false,
    returnFocus: null,
    exitAnim: null,
    dragDepth: 0,
    themeObserver: null,
    estTimer: 0,
    estCtrl: null, // { aborted } of the running smoothness estimate
    estimate: null, // { version, result } of the last finished estimate
    estSpoken: "",
    sampler: null, // { video, url, for } separate video element the estimate seeks (never the preview)
  };

  // ---------- announcements ----------
  function announce(message) {
    const live = state.refs.live;
    if (!live) return;
    live.textContent = "";
    root.setTimeout(() => {
      live.textContent = message || "";
    }, 30);
  }

  // ---------- theme + font ----------
  function luminance(color) {
    const match = /rgba?\(([^)]+)\)/.exec(color || "");
    if (!match) return null;
    const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (a === 0) return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  function detectTheme() {
    const html = doc.documentElement;
    const body = doc.body;
    let dark = Boolean(html.classList.contains("dark") || (body && body.classList.contains("dark")));
    if (!dark) {
      const lum = luminance(body && root.getComputedStyle(body).backgroundColor) ?? luminance(root.getComputedStyle(html).backgroundColor);
      dark = lum === null ? Boolean(root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches) : lum < 0.4;
    }
    state.host.dataset.theme = dark ? "dark" : "light";
  }
  function applyFont() {
    const family = doc.body ? root.getComputedStyle(doc.body).fontFamily : "";
    if (family) state.host.style.setProperty("--sv-font", family);
    state.rulerCharPx = 0; // re-measure ruler digits with the new font
  }
  function watchTheme(on) {
    if (on && !state.themeObserver && typeof root.MutationObserver === "function") {
      state.themeObserver = new root.MutationObserver(detectTheme);
      const opts = { attributes: true, attributeFilter: ["class", "style", "data-theme"] };
      state.themeObserver.observe(doc.documentElement, opts);
      if (doc.body) state.themeObserver.observe(doc.body, opts);
    } else if (!on && state.themeObserver) {
      state.themeObserver.disconnect();
      state.themeObserver = null;
    }
  }

  // ---------- video ----------
  function releaseVideo() {
    const loaded = state.loaded;
    if (!loaded) return;
    try {
      loaded.video.pause();
    } catch (_) {
      /* ignore */
    }
    if (loaded.url) URL.revokeObjectURL(loaded.url);
    state.loaded = null;
    cancelEstimate();
    releaseSampler();
    state.thumbToken++;
    state.thumbsFor = null;
    root.clearTimeout(state.filmTimer);
    state.filmTimer = 0;
  }

  async function handleFile(file) {
    if (!file || state.loading || state.building || state.sending) return;
    if (!/^video\//.test(file.type || "")) {
      setLoadError("Ese archivo no es un video. Elige un MP4, WebM o MOV.");
      if (state.step !== 1) goTo(1);
      return;
    }
    state.loading = true;
    setLoadError("");
    renderStep1();
    announce("Abriendo video…");
    try {
      const media = requireMedia();
      const loaded = await media.loadVideo(file);
      releaseVideo();
      clearResult();
      resetSendState();
      state.loaded = loaded;
      state.file = file;
      loaded.video.loop = false;
      loaded.video.muted = Boolean(state.refs.mute && state.refs.mute.dataset.muted === "true");
      state.range = M().clampRange(0, maxClipSec(), loaded.duration, maxClipSec());
      state.filmWin = M().filmWindow(state.range, loaded.duration);
      state.crop = M().defaultCrop(loaded.width, loaded.height);
      state.layers = [];
      state.selectedId = null;
      state.shape = "square";
      state.outline = false;
      markEdited();
      resetHistory();
      syncEditor();
      refreshTrim();
      updateZoomSlider();
      seekTo(state.range.start);
      state.refs.resumeName.textContent = file.name || "Video";
      state.refs.resumeName.title = file.name || "";
      state.loading = false;
      goTo(2);
      playRange();
    } catch (error) {
      SV.log("error", "ui:load-video-failed", error);
      setLoadError((error && error.message) || "No se pudo abrir el video. Prueba con un MP4 o WebM.");
    } finally {
      state.loading = false;
      renderStep1();
    }
  }

  function setLoadError(message) {
    state.loadError = message || "";
    renderStep1();
    if (message) announce(message);
  }

  function seekTo(time) {
    if (!state.loaded) return;
    try {
      state.loaded.video.currentTime = time;
    } catch (_) {
      /* not seekable yet */
    }
  }

  const video = () => state.loaded && state.loaded.video;
  function playRange() {
    const v = video();
    if (!v || state.step !== 2) return;
    if (v.currentTime < state.range.start || v.currentTime >= state.range.end - 0.05) seekTo(state.range.start);
    const promise = v.play();
    if (promise && promise.catch) promise.catch(() => updatePlayButton());
    updatePlayButton();
  }
  function pausePreview() {
    const v = video();
    if (v && !v.paused) v.pause();
    updatePlayButton();
  }
  function togglePlay() {
    const v = video();
    if (!v) return;
    if (v.paused) playRange();
    else pausePreview();
  }
  function toggleMute() {
    const button = state.refs.mute;
    const muted = button.dataset.muted !== "true";
    button.dataset.muted = String(muted);
    if (video()) video().muted = muted;
    setButton(button, muted ? "muted" : "volume", "", 20);
    button.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
  }
  function updatePlayButton() {
    const button = state.refs.play;
    if (!button) return;
    const v = video();
    const playing = Boolean(v && !v.paused);
    if (button.dataset.playing === String(playing)) return;
    button.dataset.playing = String(playing);
    setButton(button, playing ? "pause" : "play", "", 20);
    button.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
  }

  // ---------- edits ----------
  const clipLength = () => Math.max(0, state.range.end - state.range.start);
  function currentRel() {
    const v = video();
    if (!v) return 0;
    return Math.min(Math.max(v.currentTime - state.range.start, 0), clipLength());
  }
  // Any change in step 2 invalidates a built sticker.
  function markEdited() {
    state.editVersion++;
    state.viewVersion++;
    state.layersNorm = M().normalizeLayers(state.layers, clipLength());
    scheduleEstimate();
  }

  // ---------- smoothness estimate (S13 b) ----------
  // Debounced and cancelable: every edit cancels the running estimate and restarts the timer.
  // It samples on its own hidden video element, so the preview and dragging are never blocked.
  function releaseSampler() {
    const sampler = state.sampler;
    state.sampler = null;
    if (!sampler) return;
    try {
      sampler.video.pause();
      sampler.video.removeAttribute("src");
      sampler.video.load();
    } catch (_) {
      /* ignore */
    }
    if (sampler.url) URL.revokeObjectURL(sampler.url);
  }
  function cancelEstimate() {
    root.clearTimeout(state.estTimer);
    state.estTimer = 0;
    if (state.estCtrl) state.estCtrl.aborted = true;
    state.estCtrl = null;
  }
  const estimateFresh = () => Boolean(state.estimate && state.estimate.version === state.editVersion);
  const canEstimate = () => Boolean(state.loaded && SV.media && typeof SV.media.estimateSmoothness === "function");
  function scheduleEstimate() {
    cancelEstimate();
    if (!canEstimate() || estimateFresh()) return;
    renderEstimate(null);
    if (state.step !== 2 || state.building || !state.host || state.host.hidden) return; // resumes on return to step 2
    state.estTimer = root.setTimeout(runEstimate, ESTIMATE_DEBOUNCE_MS);
  }
  async function samplerVideo() {
    if (state.sampler && state.sampler.for === state.loaded) return state.sampler.video;
    releaseSampler();
    const owner = state.loaded;
    const loaded = await requireMedia().loadVideo(state.file);
    if (owner !== state.loaded) {
      URL.revokeObjectURL(loaded.url);
      return null;
    }
    loaded.video.muted = true;
    state.sampler = { video: loaded.video, url: loaded.url, for: owner };
    return loaded.video;
  }
  async function runEstimate() {
    state.estTimer = 0;
    const ctrl = { aborted: false };
    state.estCtrl = ctrl;
    const version = state.editVersion;
    const loaded = state.loaded;
    try {
      const video = await samplerVideo();
      if (!video || ctrl.aborted) return;
      const result = await requireMedia().estimateSmoothness({
        video,
        start: state.range.start,
        end: state.range.end,
        crop: { ...state.crop },
        layers: M().normalizeLayers(state.layers, clipLength()),
        shape: state.shape,
        outline: state.outline,
        signal: ctrl,
      });
      if (ctrl.aborted || version !== state.editVersion || loaded !== state.loaded) return;
      state.estimate = { version, result };
      renderEstimate(result);
    } catch (error) {
      if (ctrl.aborted || (error && error.name === "AbortError")) return;
      SV.log("warn", "ui:estimate-failed", error);
      if (state.refs.est) state.refs.est.hidden = true; // the build still works; only the hint is lost
    } finally {
      if (state.estCtrl === ctrl) state.estCtrl = null;
    }
  }
  function renderEstimate(result) {
    const r = state.refs;
    if (!r.est) return;
    const label = M().smoothnessLabel(result);
    r.est.hidden = !canEstimate();
    r.est.dataset.level = label.level;
    r.estText.textContent = label.text;
    r.estBars.forEach((bar, i) => (bar.dataset.on = String(i < label.bars)));
    // Polite, and only finished results that differ from the last one: no chatter while dragging.
    if (label.spoken && label.spoken !== state.estSpoken) {
      state.estSpoken = label.spoken;
      r.estLive.textContent = label.spoken;
    }
  }

  // ---------- undo / redo ----------
  // A snapshot holds every step-2 edit; selection and playback are not edits.
  function snapshot() {
    return JSON.parse(
      JSON.stringify({ range: state.range, crop: state.crop, layers: state.layers, shape: state.shape, outline: state.outline, normalize: state.normalize }),
    );
  }
  function resetHistory() {
    state.history = M().createHistory(snapshot());
    updateUndoButtons();
  }
  // key: bursts with the same key (typing, wheel, arrow keys) collapse into one undo step.
  function commitEdit(key) {
    if (!state.history) return;
    state.history = M().pushHistory(state.history, snapshot(), key || null, key ? Date.now() : undefined);
    updateUndoButtons();
  }
  function restoreSnapshot(snap) {
    const s = JSON.parse(JSON.stringify(snap));
    state.range = s.range;
    state.crop = s.crop;
    state.layers = s.layers;
    state.shape = s.shape;
    state.outline = s.outline;
    state.normalize = s.normalize;
    state.nextLayerId = Math.max(state.nextLayerId, ...state.layers.map((layer) => layer.id + 1));
    if (state.selectedId !== null && !layerById(state.selectedId)) state.selectedId = null;
    markEdited();
    refreshTrim();
    refocusFilm();
    updateZoomSlider();
    syncEditor();
    const v = video();
    if (v && (v.currentTime < state.range.start || v.currentTime > state.range.end)) state.pendingSeek = state.range.start;
  }
  function undo() {
    if (!M().canUndo(state.history)) return;
    state.history = M().undoHistory(state.history);
    restoreSnapshot(state.history.present);
    announce("Cambio deshecho.");
  }
  function redo() {
    if (!M().canRedo(state.history)) return;
    state.history = M().redoHistory(state.history);
    restoreSnapshot(state.history.present);
    announce("Cambio rehecho.");
  }
  function updateUndoButtons() {
    const r = state.refs;
    if (!r.undo) return;
    r.undo.disabled = !M().canUndo(state.history);
    r.redo.disabled = !M().canRedo(state.history);
  }

  // ---------- trim / timeline ----------
  function setRangeFromHandle(which, value) {
    if (!state.loaded) return;
    const next = M().moveTrimHandle(state.range, which, value, state.loaded.duration, maxClipSec());
    if (next.start === state.range.start && next.end === state.range.end) return;
    const oldLen = clipLength();
    state.range = next;
    state.layers = M().refitLayerTimes(state.layers, oldLen, clipLength());
    markEdited();
    refreshTrim();
    positionTracks();
    refocusFilm();
  }

  // The filmstrip, trim handles and playhead map to state.filmWin: the whole video for short
  // videos, a zoomed slice around the selection for long ones (S11).
  function trackPx(time) {
    return M().windowRatio(time, state.filmWin) * state.trackW;
  }

  function refreshTrim() {
    const r = state.refs;
    if (!r.track) return;
    const duration = state.loaded ? state.loaded.duration : 0;
    const startRatio = M().windowRatio(state.range.start, state.filmWin);
    const endRatio = M().windowRatio(state.range.end, state.filmWin);
    const w = state.trackW;
    r.shadeL.style.transform = `scaleX(${startRatio})`;
    r.shadeR.style.transform = `scaleX(${1 - endRatio})`;
    r.window.style.transform = `translateX(${startRatio * w}px) scaleX(${Math.max(endRatio - startRatio, 0.0001)})`;
    r.handleStart.style.transform = `translateX(${startRatio * w - HANDLE_W}px)`;
    r.handleEnd.style.transform = `translateX(${endRatio * w}px)`;
    for (const [handle, value, label] of [[r.handleStart, state.range.start, "Inicio"], [r.handleEnd, state.range.end, "Fin"]]) {
      handle.setAttribute("aria-valuemax", String(round1(duration)));
      handle.setAttribute("aria-valuenow", String(round1(value)));
      handle.setAttribute("aria-valuetext", `${label}: ${fmtSec(value)}`);
    }
    r.lenValue.textContent = fmtSec(clipLength());
    r.lenMax.textContent = ` · máx. ${round1(maxClipSec())} s`;
    r.playhead.setAttribute("aria-valuemax", String(round1(clipLength())));
    state.drawKey = "";
    updateOverview();
    renderRuler(startRatio * w, endRatio * w);
  }

  // Time ruler above the filmstrip (S12): labels on their own row, never under a trim handle,
  // never cut at the edges. The layout is pure (uiModel.rulerLayout); this only places nodes.
  function rulerCharPx() {
    if (state.rulerCharPx) return state.rulerCharPx;
    let px = 6.5;
    try {
      const ctx = doc.createElement("canvas").getContext("2d");
      const family = (state.host && state.host.style.getPropertyValue("--sv-font")) || "sans-serif";
      ctx.font = `500 11px ${family}`;
      // Digits are the widest glyphs a clock uses; the slack covers tabular figures.
      px = Math.max(...[..."0123456789"].map((d) => ctx.measureText(d).width)) + 0.4;
    } catch (_) {
      // Keep the estimate.
    }
    state.rulerCharPx = Number.isFinite(px) && px > 3 ? px : 6.5;
    return state.rulerCharPx;
  }
  function renderRuler(startPx, endPx) {
    const ruler = state.refs.ruler;
    const w = state.trackW;
    if (!ruler || !w) return;
    const win = state.filmWin;
    const key = `${win.start}|${win.end}|${w}|${state.range.start}|${state.range.end}|${Math.round(startPx)}|${Math.round(endPx)}`;
    if (key === state.rulerKey) return;
    state.rulerKey = key;
    const avoid = [
      { from: startPx - HANDLE_W, to: startPx },
      { from: endPx, to: endPx + HANDLE_W },
    ];
    // The selection's own start and end sit above their handles; clock times when zoomed.
    const duration = state.loaded ? state.loaded.duration : 0;
    const zoomed = win.end - win.start < duration - 1e-6;
    const fmt = zoomed ? M().fmtClock : fmtSec;
    const pins = [
      { x: startPx - HANDLE_W / 2, text: fmt(state.range.start) },
      { x: endPx + HANDLE_W / 2, text: fmt(state.range.end) },
    ];
    const format = zoomed ? M().fmtClock : (t) => `${t} s`;
    const layout = M().rulerLayout({ win, width: w, avoid, pins, format, charPx: rulerCharPx() });
    const nodes = layout.ticks.map((tick) => {
      const node = el("span", { class: tick.major ? "tick major" : "tick" });
      node.style.transform = `translateX(${tick.x.toFixed(1)}px)`;
      return node;
    });
    for (const label of layout.labels) {
      const node = el("span", { class: label.pin ? "tick-label pin" : "tick-label", text: label.text });
      node.style.transform = `translateX(${label.left.toFixed(1)}px)`;
      node.style.inlineSize = `${label.width.toFixed(1)}px`;
      nodes.push(node);
    }
    ruler.replaceChildren(...nodes);
  }

  // Recenters the zoom window when the selection reaches its edges. Never while a pointer drags
  // on the filmstrip (the mapping must not move under the finger); release calls it again.
  function refocusFilm() {
    if (!state.loaded || state.handleDrag || state.scrub) return;
    const duration = state.loaded.duration;
    if (!M().needsRefocus(state.filmWin, state.range, duration)) return;
    const next = M().filmWindow(state.range, duration);
    const prev = state.filmWin;
    if (next.start === prev.start && next.end === prev.end) return;
    shiftFilm(prev, next);
    state.filmWin = next;
    refreshTrim();
    scheduleThumbs();
  }

  // Keeps the current thumbnails visible (moved to their new place) until new ones arrive.
  function shiftFilm(prev, next) {
    const canvas = state.refs.film;
    if (!canvas || !canvas.width) return;
    const ctx = canvas.getContext("2d");
    const width = prev.end - prev.start;
    const dx = width > 0 ? ((prev.start - next.start) / width) * canvas.width : canvas.width;
    if (Math.abs(width - (next.end - next.start)) > 1e-6 || Math.abs(dx) >= canvas.width) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = "copy"; // exposed areas become empty
    ctx.drawImage(canvas, dx, 0);
    ctx.restore();
  }

  // Debounced and cancelable: a running pass stops at its next frame.
  function scheduleThumbs() {
    state.thumbToken++;
    state.thumbsFor = null;
    root.clearTimeout(state.filmTimer);
    state.filmTimer = root.setTimeout(() => {
      state.filmTimer = 0;
      drawFilmstrip();
    }, FILM_DEBOUNCE_MS);
  }

  // ---------- whole-video overview (long videos only) ----------
  function updateOverview() {
    const r = state.refs;
    if (!r.ov) return;
    const duration = state.loaded ? state.loaded.duration : 0;
    const win = state.filmWin;
    const zoomed = duration > 0 && win.end - win.start < duration - 1e-6;
    r.ov.hidden = !zoomed;
    if (!zoomed) return;
    const pct = (t) => `${(M().timeToRatio(t, duration) * 100).toFixed(3)}%`;
    r.ovView.style.insetInlineStart = pct(win.start);
    r.ovView.style.inlineSize = `calc(${pct(win.end)} - ${pct(win.start)})`;
    r.ovSel.style.insetInlineStart = pct(state.range.start);
    r.ovSel.style.inlineSize = `calc(${pct(state.range.end)} - ${pct(state.range.start)})`;
    const { start, end } = state.range;
    const clock = M().fmtClock;
    r.ovEnd.textContent = clock(duration);
    r.ovRange.textContent = `${clock(start)} – ${clock(end)}`;
    r.overview.setAttribute("aria-valuemax", String(round1(Math.max(0, duration - clipLength()))));
    r.overview.setAttribute("aria-valuenow", String(round1(start)));
    r.overview.setAttribute("aria-valuetext", `Fragmento de ${clock(start)} a ${clock(end)}, de ${clock(duration)} en total`);
  }

  // Moves the whole selection (same length); layer times are clip-relative, so they stay valid.
  function moveSelection(next) {
    if (next.start === state.range.start && next.end === state.range.end) return;
    state.range = next;
    markEdited();
    refreshTrim();
    refocusFilm();
    state.pendingSeek = next.start;
  }
  function ovTimeFromPointer(event) {
    const rect = state.refs.overview.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    return Math.min(Math.max(ratio, 0), 1) * state.loaded.duration;
  }
  function onOvDown(event) {
    if (!state.loaded || event.button !== 0) return;
    event.preventDefault();
    const v = video();
    const t = ovTimeFromPointer(event);
    state.ovDrag = { id: event.pointerId, grab: M().overviewGrab(state.range, t), wasPlaying: Boolean(v && !v.paused) };
    if (v) v.pause();
    updatePlayButton();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    moveSelection(M().placeRange(state.range, t - state.ovDrag.grab, state.loaded.duration));
  }
  function onOvMove(event) {
    const drag = state.ovDrag;
    if (!drag || drag.id !== event.pointerId) return;
    moveSelection(M().placeRange(state.range, ovTimeFromPointer(event) - drag.grab, state.loaded.duration));
  }
  function onOvUp(event) {
    const drag = state.ovDrag;
    if (!drag || drag.id !== event.pointerId) return;
    state.ovDrag = null;
    commitEdit();
    state.pendingSeek = state.range.start;
    if (drag.wasPlaying) playRange();
  }
  function onOvKey(event) {
    if (!state.loaded) return;
    const duration = state.loaded.duration;
    const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    let next;
    if (event.key in steps) next = M().shiftRange(state.range, steps[event.key], duration);
    else if (event.key === "Home") next = M().placeRange(state.range, 0, duration);
    else if (event.key === "End") next = M().placeRange(state.range, duration, duration);
    else return;
    event.preventDefault();
    pausePreview();
    moveSelection(next);
    commitEdit("overview-key");
  }

  function measureTrack() {
    const track = state.refs.track;
    const width = track ? track.clientWidth : 0;
    if (width && width !== state.trackW) {
      state.trackW = width;
      refreshTrim();
    }
  }

  function timeFromPointer(event) {
    const rect = state.refs.track.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    return M().windowTime(ratio, state.filmWin);
  }

  function onHandleDown(which) {
    return (event) => {
      if (!state.loaded || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const v = video();
      state.handleDrag = { id: event.pointerId, which, wasPlaying: Boolean(v && !v.paused) };
      if (v) v.pause();
      updatePlayButton();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
    };
  }
  function onHandleMove(event) {
    const drag = state.handleDrag;
    if (!drag || drag.id !== event.pointerId) return;
    setRangeFromHandle(drag.which, timeFromPointer(event));
    state.pendingSeek = drag.which === "start" ? state.range.start : Math.max(state.range.start, state.range.end - 0.04);
  }
  function onHandleUp(event) {
    const drag = state.handleDrag;
    if (!drag || drag.id !== event.pointerId) return;
    state.handleDrag = null;
    state.pendingSeek = state.range.start;
    commitEdit();
    refocusFilm();
    if (drag.wasPlaying) playRange();
  }
  function onHandleKey(which) {
    return (event) => {
      if (!state.loaded) return;
      const value = which === "start" ? state.range.start : state.range.end;
      const steps = { ArrowLeft: -0.1, ArrowDown: -0.1, ArrowRight: 0.1, ArrowUp: 0.1, PageDown: -1, PageUp: 1 };
      let next;
      if (event.key in steps) next = value + steps[event.key] * (event.shiftKey ? 10 : 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = state.loaded.duration;
      else return;
      event.preventDefault();
      setRangeFromHandle(which, next);
      commitEdit("trim-key");
      seekTo(which === "start" ? state.range.start : Math.max(state.range.start, state.range.end - 0.04));
    };
  }

  function onTrackDown(event) {
    if (!state.loaded || event.button !== 0) return;
    const v = video();
    state.scrub = { id: event.pointerId, wasPlaying: Boolean(v && !v.paused) };
    if (v) v.pause();
    updatePlayButton();
    state.refs.track.setPointerCapture(event.pointerId);
    scrubTo(timeFromPointer(event));
  }
  function onTrackMove(event) {
    if (!state.scrub || state.scrub.id !== event.pointerId) return;
    scrubTo(timeFromPointer(event));
  }
  function onTrackUp(event) {
    if (!state.scrub || state.scrub.id !== event.pointerId) return;
    const { wasPlaying } = state.scrub;
    state.scrub = null;
    if (wasPlaying) playRange();
  }
  function scrubTo(absTime) {
    state.pendingSeek = Math.min(Math.max(absTime, state.range.start), Math.max(state.range.start, state.range.end - 0.02));
  }
  function onTrackKey(event) {
    if (!state.loaded) return;
    const steps = { ArrowLeft: -0.1, ArrowDown: -0.1, ArrowRight: 0.1, ArrowUp: 0.1 };
    if (event.key in steps) {
      pausePreview();
      scrubTo(video().currentTime + steps[event.key] * (event.shiftKey ? 10 : 1));
    } else if (event.key === "Home") scrubTo(state.range.start);
    else if (event.key === "End") scrubTo(state.range.end);
    else if (event.key === " " || event.key === "Enter") togglePlay();
    else return;
    event.preventDefault();
  }

  // Filmstrip: a second <video> on the same object URL seeks for thumbnails, so the preview
  // keeps playing undisturbed. One canvas, drawn slot by slot as frames arrive.
  function once(target, type, ms) {
    return new Promise((resolve) => {
      const done = (ok) => {
        target.removeEventListener(type, onOk);
        target.removeEventListener("error", onErr);
        root.clearTimeout(timer);
        resolve(ok);
      };
      const onOk = () => done(true);
      const onErr = () => done(false);
      const timer = root.setTimeout(() => done(false), ms);
      target.addEventListener(type, onOk);
      target.addEventListener("error", onErr);
    });
  }
  async function drawFilmstrip() {
    const loaded = state.loaded;
    const canvas = state.refs.film;
    const win = state.filmWin;
    const done = state.thumbsFor;
    if (!loaded || !canvas || !state.trackW) return;
    if (done && done.loaded === loaded && done.start === win.start && done.end === win.end) return;
    state.thumbsFor = { loaded, start: win.start, end: win.end };
    const token = ++state.thumbToken;
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const w = Math.round(state.trackW * dpr);
    const h = Math.round(canvas.clientHeight * dpr) || Math.round(52 * dpr);
    // Same size: keep the shifted old thumbnails (shiftFilm) until each slot is redrawn.
    if (canvas.width !== w || canvas.height !== h || !done || done.loaded !== loaded) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    const thumbs = doc.createElement("video");
    thumbs.muted = true;
    thumbs.preload = "auto";
    thumbs.playsInline = true;
    thumbs.src = loaded.url;
    try {
      if (!(await once(thumbs, "loadeddata", 4000))) return;
      // Slots close to the video's own aspect ratio, so frames are barely cropped (S12).
      const count = M().thumbSlots(w, h, thumbs.videoWidth || loaded.width, thumbs.videoHeight || loaded.height);
      const slot = w / count;
      const width = win.end - win.start;
      // Slots nearest the selection first: that is where the user is looking.
      const center = M().windowRatio((state.range.start + state.range.end) / 2, win) * count;
      const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => Math.abs(a + 0.5 - center) - Math.abs(b + 0.5 - center));
      for (const i of order) {
        if (token !== state.thumbToken) return;
        thumbs.currentTime = win.start + ((i + 0.5) / count) * width;
        if (!(await once(thumbs, "seeked", 3000))) continue;
        if (token !== state.thumbToken) return;
        // object-fit: cover into each slot
        const vw = thumbs.videoWidth;
        const vh = thumbs.videoHeight;
        const scale = Math.max(slot / vw, h / vh);
        const sw = slot / scale;
        const sh = h / scale;
        ctx.drawImage(thumbs, (vw - sw) / 2, (vh - sh) / 2, sw, sh, Math.round(i * slot), 0, Math.ceil(slot), h);
      }
    } catch (error) {
      SV.log("warn", "ui:filmstrip-failed", error);
    } finally {
      thumbs.removeAttribute("src");
      thumbs.load();
    }
  }

  // ---------- crop ----------
  function updateZoomSlider() {
    const zoom = state.refs.zoom;
    if (!state.loaded || !state.crop || !zoom) return;
    const short = Math.min(state.loaded.width, state.loaded.height);
    const value = short / state.crop.size;
    const max = 1 / M().MIN_CROP_RATIO;
    zoom.max = String(round1(max));
    zoom.value = String(value);
    zoom.setAttribute("aria-valuetext", `${value.toFixed(1)}×`);
    zoom.style.setProperty("--fill", `${((value - 1) / (max - 1)) * 100}%`);
  }
  function applyZoom(factor, anchorX, anchorY) {
    if (!state.loaded) return;
    const { width, height } = state.loaded;
    state.crop = M().zoomCrop(state.crop, factor, anchorX, anchorY, width, height);
    cropChanged();
  }
  function applyPan(dx, dy) {
    if (!state.loaded) return;
    state.crop = M().panCrop(state.crop, dx, dy, state.loaded.width, state.loaded.height);
    cropChanged();
  }
  function cropChanged() {
    markEdited();
    updateZoomSlider();
    dismissHint();
  }
  function dismissHint() {
    if (state.hintGone) return;
    state.hintGone = true;
    state.refs.stageHint.dataset.gone = "true";
  }
  function resetCrop() {
    if (!state.loaded) return;
    state.crop = M().defaultCrop(state.loaded.width, state.loaded.height);
    cropChanged();
    commitEdit();
  }
  function canvasRect() {
    return state.refs.canvas.getBoundingClientRect();
  }
  function sourceAt(clientX, clientY, rect) {
    const u = rect.width ? (clientX - rect.left) / rect.width : 0.5;
    const v = rect.height ? (clientY - rect.top) / rect.height : 0.5;
    return [state.crop.x + u * state.crop.size, state.crop.y + v * state.crop.size];
  }
  // Pointer position normalized to the output square (0..1).
  function stagePoint(clientX, clientY, rect) {
    const box = rect || canvasRect();
    return { x: box.width ? (clientX - box.left) / box.width : 0.5, y: box.height ? (clientY - box.top) / box.height : 0.5 };
  }
  function pointerPair() {
    const [a, b] = [...state.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  // ---------- layers on the stage ----------
  const layerById = (id) => state.layers.find((layer) => layer.id === id) || null;
  const selectedLayer = () => (state.selectedId === null ? null : layerById(state.selectedId));
  const isShown = (layer, rel) => layer.start <= rel && rel < layer.end;
  const layerName = (layer) => (layer.type === "emoji" ? `Emoji ${layer.text}` : layer.text.trim() ? `Texto «${layer.text.trim()}»` : "Texto vacío");

  // Normalized box of a layer, measured with the preview context (same math as the output).
  function boxOf(layer) {
    const media = SV.media;
    if (!media || typeof media.layerBox !== "function" || !state.refs.ctx) return { x: layer.x, y: layer.y, w: 0.2, h: 0.1 };
    return media.layerBox(state.refs.ctx, layer, outputSize());
  }
  // Tappable boxes: layers on screen now, plus the selected one, in z-order.
  function hitBoxes() {
    const rel = currentRel();
    return state.layers
      .filter((layer) => layer.id === state.selectedId || (isShown(layer, rel) && String(layer.text).trim()))
      .map((layer) => ({ id: layer.id, ...boxOf(layer) }));
  }
  function setLayer(id, next) {
    const i = state.layers.findIndex((layer) => layer.id === id);
    if (i < 0) return;
    state.layers[i] = next;
    markEdited();
  }
  function hitAt(clientX, clientY) {
    const p = stagePoint(clientX, clientY);
    return { p, id: M().hitTest(hitBoxes(), p.x, p.y, HIT_PAD) };
  }

  function onStageDown(event) {
    if (!state.loaded || (event.pointerType === "mouse" && event.button !== 0)) return;
    const canvas = state.refs.canvas;
    canvas.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.classList.add("dragging");
    if (state.pointers.size === 2) {
      state.pinchDist = pointerPair().dist;
      state.layerDrag = null; // a second finger turns a move into a pinch
      return;
    }
    if (state.pointers.size > 2) return;
    const { p, id } = hitAt(event.clientX, event.clientY);
    if (id === null) {
      selectLayer(null);
      return;
    }
    selectLayer(id);
    const layer = layerById(id);
    state.layerDrag = { id, pointerId: event.pointerId, mode: "move", start: p, origin: { x: layer.x, y: layer.y }, box: boxOf(layer), moved: false };
  }
  function onStageMove(event) {
    const prev = state.pointers.get(event.pointerId);
    if (!prev || !state.loaded) return;
    const rect = canvasRect();
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointers.size >= 2) {
      const pair = pointerPair();
      if (state.pinchDist > 0 && pair.dist > 0) {
        const factor = pair.dist / state.pinchDist;
        const layer = selectedLayer();
        if (layer) setLayer(layer.id, M().resizeLayer(layer, factor, boxOf(layer)));
        else {
          const [ax, ay] = sourceAt(pair.mx, pair.my, rect);
          applyZoom(factor, ax, ay);
        }
      }
      state.pinchDist = pair.dist;
      return;
    }
    const drag = state.layerDrag;
    if (drag && drag.pointerId === event.pointerId && drag.mode === "move") {
      const p = stagePoint(event.clientX, event.clientY, rect);
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!drag.moved) {
        drag.moved = true;
        state.layers = M().bringToFront(state.layers, drag.id);
        syncTracks();
      }
      const layer = layerById(drag.id);
      if (layer) setLayer(drag.id, M().moveLayer({ ...layer, x: drag.origin.x, y: drag.origin.y }, dx, dy, drag.box));
      return;
    }
    if (selectedLayer()) return; // a finger left over from a pinch never pans under a selection
    const scale = rect.width ? state.crop.size / rect.width : 0;
    applyPan(-(event.clientX - prev.x) * scale, -(event.clientY - prev.y) * scale);
  }
  function onStageUp(event) {
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) state.pinchDist = 0;
    const drag = state.layerDrag;
    if (drag && drag.pointerId === event.pointerId) state.layerDrag = null;
    if (!state.pointers.size) {
      state.refs.canvas.classList.remove("dragging");
      commitEdit();
    }
  }
  function onStageDblClick(event) {
    const { id } = hitAt(event.clientX, event.clientY);
    const layer = id === null ? null : layerById(id);
    if (layer && layer.type === "text") editText(layer.id);
  }
  function onStageWheel(event) {
    if (!state.loaded) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
    const layer = selectedLayer();
    if (layer) {
      setLayer(layer.id, M().resizeLayer(layer, factor, boxOf(layer)));
      commitEdit("size:" + layer.id);
      return;
    }
    const [ax, ay] = sourceAt(event.clientX, event.clientY, canvasRect());
    applyZoom(factor, ax, ay);
    commitEdit("zoom");
  }
  function onStageKey(event) {
    if (!state.loaded) return;
    const layer = selectedLayer();
    if (layer) {
      const step = LAYER_KEY_STEP * (event.shiftKey ? 5 : 1);
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[event.key]) {
        setLayer(layer.id, M().moveLayer(layer, ...moves[event.key], boxOf(layer)));
        commitEdit("key-move:" + layer.id);
      } else if (event.key === "+" || event.key === "=" || event.key === "-") {
        setLayer(layer.id, M().resizeLayer(layer, event.key === "-" ? 1 / LAYER_KEY_ZOOM : LAYER_KEY_ZOOM, boxOf(layer)));
        commitEdit("size:" + layer.id);
      } else if (event.key === "Delete" || event.key === "Backspace") deleteLayer(layer.id);
      else if (event.key === "Enter" && layer.type === "text") editText(layer.id);
      else if (event.key === " ") togglePlay();
      else return;
      event.preventDefault();
      return;
    }
    const step = state.crop.size * PAN_STEP_RATIO;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) applyPan(...moves[event.key]);
    else if (event.key === "+" || event.key === "=") applyZoom(KEY_ZOOM);
    else if (event.key === "-") applyZoom(1 / KEY_ZOOM);
    else if (event.key === " ") {
      togglePlay();
      event.preventDefault();
      return;
    } else return;
    commitEdit("crop-key");
    event.preventDefault();
  }

  // Resize handle of the selection box: scale follows the pointer's distance to the layer center.
  function onSizeDown(event) {
    const layer = selectedLayer();
    if (!layer || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRect();
    const center = { x: rect.left + layer.x * rect.width, y: rect.top + layer.y * rect.height };
    const startDist = Math.max(8, Math.hypot(event.clientX - center.x, event.clientY - center.y));
    state.layerDrag = { id: layer.id, pointerId: event.pointerId, mode: "resize", center, startDist, origin: { ...layer }, box: boxOf(layer) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onSizeMove(event) {
    const drag = state.layerDrag;
    if (!drag || drag.mode !== "resize" || drag.pointerId !== event.pointerId) return;
    const factor = Math.hypot(event.clientX - drag.center.x, event.clientY - drag.center.y) / drag.startDist;
    const layer = layerById(drag.id);
    if (layer) setLayer(drag.id, M().resizeLayer({ ...layer, scale: drag.origin.scale, x: drag.origin.x, y: drag.origin.y }, factor, drag.box));
  }
  function onSizeUp(event) {
    const drag = state.layerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.layerDrag = null;
    commitEdit();
  }

  // Shows a short tip over the preview, then fades it out.
  function flashHint(text) {
    const hint = state.refs.stageHint;
    if (!hint) return;
    hint.textContent = text;
    hint.dataset.gone = "false";
    root.clearTimeout(state.hintTimer);
    state.hintTimer = root.setTimeout(() => {
      hint.dataset.gone = "true";
    }, HINT_MS);
  }

  // ---------- preview loop ----------
  function startLoop() {
    if (state.rafId || !state.host || state.host.hidden || !state.loaded || state.step !== 2) return;
    state.rafId = root.requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (state.rafId) root.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }
  function tick() {
    state.rafId = 0;
    if (state.host.hidden || !state.loaded || state.step !== 2) return;
    const v = state.loaded.video;
    if (state.pendingSeek !== null && !v.seeking) {
      seekTo(state.pendingSeek);
      state.pendingSeek = null;
    } else if (!v.paused && !v.seeking && (v.currentTime >= state.range.end || v.currentTime < state.range.start - 0.25)) {
      seekTo(state.range.start); // loop the selected range
    }
    // Redraw only when the frame or the edit changed: no work while paused and idle.
    const key = `${v.currentTime}|${state.viewVersion}|${v.readyState}`;
    if (key !== state.drawKey) {
      state.drawKey = key;
      drawPreview();
      updateOverlay();
      updatePlayhead();
    }
    state.rafId = root.requestAnimationFrame(tick);
  }
  function drawPreview() {
    const v = state.loaded.video;
    if (v.readyState < 2) return;
    const media = SV.media;
    if (!media || typeof media.drawFrame !== "function") {
      if (!state.drawWarned) announce("La vista previa no está disponible: falta el módulo de video.");
      state.drawWarned = true;
      return;
    }
    const canvas = state.refs.canvas;
    try {
      media.drawFrame(state.refs.ctx, v, state.crop, state.layersNorm, currentRel(), canvas.width, { shape: state.shape, outline: state.outline });
    } catch (error) {
      if (!state.drawWarned) SV.log("error", "ui:draw-frame-failed", error);
      state.drawWarned = true;
    }
  }
  function updatePlayhead() {
    const r = state.refs;
    const v = video();
    if (!v) return;
    const abs = Math.min(Math.max(v.currentTime, state.range.start), state.range.end);
    r.playhead.style.transform = `translateX(${trackPx(abs)}px)`;
    const rel = currentRel();
    const text = fmtSec(rel);
    if (text !== state.timeText) {
      state.timeText = text;
      r.timeNow.textContent = text;
      r.playhead.setAttribute("aria-valuenow", String(round1(rel)));
      r.playhead.setAttribute("aria-valuetext", text);
    }
    // Layer tracks: playhead line and which layers are on screen right now.
    const len = clipLength();
    if (r.ltHead && len > 0) r.ltHead.style.transform = `translateX(${(rel / len) * state.trackW}px)`;
    const live = state.layers.filter((layer) => isShown(layer, rel)).map((layer) => layer.id);
    const liveKey = live.join(",");
    if (liveKey !== state.liveKey && r.ltList) {
      state.liveKey = liveKey;
      for (const row of r.ltList.querySelectorAll(".lt-row")) row.dataset.live = String(live.includes(Number(row.dataset.id)));
    }
  }

  // ---------- layers: selection and edits ----------
  // Everything that changes how the editor looks (not the sticker) goes through here.
  function syncEditor() {
    syncTracks();
    syncTextPanel();
    syncShapePanel();
    syncSound();
    updateUndoButtons();
    state.viewVersion++;
  }
  function afterLayerChange() {
    syncTracks();
    syncTextPanel();
    state.viewVersion++;
  }

  function selectLayer(id) {
    const next = id === null || id === undefined ? null : id;
    if (state.selectedId === next) return;
    const prev = state.selectedId;
    state.selectedId = next;
    if (prev !== null) dropIfEmpty(prev);
    const layer = selectedLayer();
    if (layer) {
      if (layer.type === "text" && state.tool !== "text") state.refs.selectTool("text");
      if (!state.layerHintShown) {
        state.layerHintShown = true;
        flashHint("Arrastra para moverlo");
      }
      // Selected from its track while off screen: jump to where it shows.
      if (!isShown(layer, currentRel())) state.pendingSeek = state.range.start + layer.start;
      announce(`${layerName(layer)} seleccionado.`);
    }
    afterLayerChange();
  }
  // A text layer left empty disappears when it loses the selection.
  function dropIfEmpty(id) {
    const layer = layerById(id);
    if (!layer || layer.type !== "text" || layer.text.trim()) return;
    state.layers = state.layers.filter((item) => item.id !== id);
    markEdited();
    commitEdit();
  }
  function deleteLayer(id) {
    const layer = layerById(id);
    if (!layer) return;
    state.layers = state.layers.filter((item) => item.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    markEdited();
    commitEdit();
    afterLayerChange();
    announce(`${layerName(layer)} borrado. Puedes deshacerlo.`);
    state.refs.canvas.focus({ preventScroll: true });
  }
  function canAddLayer() {
    if (state.layers.length < MAX_LAYERS) return true;
    announce(`Puedes poner hasta ${MAX_LAYERS} textos o emojis. Borra uno para añadir otro.`);
    return false;
  }

  function addTextLayer(style) {
    if (!state.loaded) return;
    const current = selectedLayer();
    if (current && current.type === "text" && !current.text.trim()) {
      if (style) applyStyle(style);
      focusTextInput();
      return;
    }
    if (!canAddLayer()) return;
    // Not committed yet: the first typed letter makes it an undo step, an empty one just vanishes.
    const layer = M().createLayer("text", { style }, state.nextLayerId++, clipLength());
    state.layers.push(layer);
    markEdited();
    selectLayer(layer.id);
    state.refs.selectTool("text");
    focusTextInput();
  }
  function addEmojiLayer(char, name) {
    if (!state.loaded || !canAddLayer()) return;
    const count = state.layers.filter((layer) => layer.type === "emoji").length;
    const offsets = [0, 0.16, -0.16, 0.3, -0.3];
    const draft = M().createLayer("emoji", { text: char, x: 0.5 + offsets[count % offsets.length] }, state.nextLayerId++, clipLength());
    const layer = M().clampLayer(draft, boxOf(draft));
    state.layers.push(layer);
    markEdited();
    commitEdit();
    selectLayer(layer.id);
    announce(`Emoji ${name} añadido. Arrástralo en la vista previa para moverlo.`);
  }
  function applyStyle(style) {
    const layer = selectedLayer();
    if (!layer || layer.type !== "text") {
      addTextLayer(style);
      return;
    }
    const next = { ...layer, style, color: M().STYLE_COLORS[style] || layer.color };
    setLayer(layer.id, M().clampLayer(next, boxOf(next)));
    commitEdit();
    syncTextPanel();
  }
  function applyColor(color) {
    const layer = selectedLayer();
    if (!layer || layer.type !== "text") return;
    setLayer(layer.id, { ...layer, color });
    commitEdit();
    syncTextPanel();
  }
  function onTextInput() {
    const layer = selectedLayer();
    if (!layer || layer.type !== "text") return;
    const next = { ...layer, text: state.refs.textInput.value };
    setLayer(layer.id, M().clampLayer(next, boxOf(next)));
    commitEdit("text:" + layer.id);
    syncTracks();
  }
  function editText(id) {
    selectLayer(id);
    state.refs.selectTool("text");
    focusTextInput(true);
  }
  function focusTextInput(selectAll) {
    const input = state.refs.textInput;
    if (!input || input.hidden) return;
    input.focus({ preventScroll: true });
    if (selectAll) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }
  function finishTextEdit() {
    state.refs.canvas.focus({ preventScroll: true });
  }
  // "Empieza aquí" / "Termina aquí" for the selected layer, from the playhead.
  function setLayerEdge(edge) {
    const layer = selectedLayer();
    if (!layer) return;
    setLayer(layer.id, { ...layer, ...M().setCueEdge(layer, edge, currentRel(), clipLength()) });
    commitEdit();
    positionTracks();
    state.liveKey = "";
    announce(`${layerName(layer)}: ${edge === "start" ? "empieza" : "termina"} en ${fmtSec(currentRel())}.`);
  }

  // ---------- tool panels ----------
  function syncTextPanel() {
    const r = state.refs;
    if (!r.textEdit) return;
    const layer = selectedLayer();
    const text = layer && layer.type === "text" ? layer : null;
    r.textEdit.hidden = !text;
    r.colorRow.hidden = !text;
    r.textStart.hidden = Boolean(text);
    if (text && r.textInput.value !== text.text) r.textInput.value = text.text;
    for (const button of r.styleButtons) button.setAttribute("aria-pressed", String(Boolean(text && text.style === button.dataset.value)));
    const color = text ? String(text.color).toLowerCase() : "";
    for (const button of r.colorButtons) button.setAttribute("aria-pressed", String(button.dataset.value === color));
  }
  function setShape(shape) {
    if (state.shape === shape) return;
    state.shape = shape;
    markEdited();
    commitEdit();
    syncShapePanel();
  }
  function syncShapePanel() {
    const r = state.refs;
    if (!r.shapeButtons) return;
    r.shapeButtons.forEach((button) => {
      const on = button.dataset.value === state.shape;
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    r.outlineSwitch.setAttribute("aria-checked", String(state.outline));
    r.stage.dataset.shape = state.shape;
    r.stage.dataset.outline = String(state.outline);
  }
  function syncSound() {
    if (state.refs.normSwitch) state.refs.normSwitch.setAttribute("aria-checked", String(state.normalize));
  }

  // ---------- per-layer timing tracks ----------
  // Rebuilds rows only when the set or order of layers changes, so a drag never loses its element.
  function syncTracks() {
    const r = state.refs;
    if (!r.lt) return;
    const order = state.layers.slice().reverse(); // topmost first, like a layer list
    const key = order.map((layer) => layer.id).join(",");
    if (key !== state.tracksKey) {
      state.tracksKey = key;
      r.ltList.replaceChildren(...order.map(buildTrackRow), r.ltHead);
    }
    for (const row of r.ltList.querySelectorAll(".lt-row")) {
      const layer = layerById(Number(row.dataset.id));
      if (!layer) continue;
      const on = layer.id === state.selectedId;
      row.dataset.selected = String(on);
      const label = row.querySelector(".lt-label");
      const name = layer.type === "emoji" ? layer.text : layer.text.trim() || "Texto vacío";
      if (label.textContent !== name) label.textContent = name;
      row.querySelector(".lt-body").setAttribute("aria-pressed", String(on));
    }
    const has = state.layers.length > 0;
    r.lt.hidden = !has;
    const selected = selectedLayer();
    r.ltActions.hidden = !selected;
    if (selected) r.ltSelName.textContent = layerName(selected);
    positionTracks();
    state.liveKey = "";
  }
  function positionTracks() {
    const r = state.refs;
    if (!r.ltList) return;
    const len = clipLength() || 1;
    for (const row of r.ltList.querySelectorAll(".lt-row")) {
      const layer = layerById(Number(row.dataset.id));
      if (!layer) continue;
      const left = (Math.min(layer.start, len) / len) * 100;
      const right = (Math.min(layer.end, len) / len) * 100;
      const body = row.querySelector(".lt-body");
      body.style.left = `${left}%`;
      body.style.width = `${Math.max(right - left, 0)}%`;
      const [gripStart, gripEnd] = row.querySelectorAll(".lt-grip");
      gripStart.style.left = `${left}%`;
      gripEnd.style.left = `${right}%`;
      const name = layerName(layer);
      body.setAttribute("aria-label", `${name}: se ve de ${fmtSec(layer.start)} a ${fmtSec(layer.end)}`);
      for (const [grip, edge, value] of [[gripStart, "Inicio", layer.start], [gripEnd, "Fin", layer.end]]) {
        grip.setAttribute("aria-valuemax", String(round1(len)));
        grip.setAttribute("aria-valuenow", String(round1(value)));
        grip.setAttribute("aria-valuetext", `${edge}: ${fmtSec(value)}`);
      }
    }
  }
  function buildTrackRow(layer) {
    const id = layer.id;
    const body = el("button", { type: "button", class: "lt-body", "aria-pressed": "false" }, [el("span", { class: "lt-label" })]);
    const grip = (part, label) =>
      el("div", { class: `lt-grip ${part}`, role: "slider", tabindex: "0", "aria-label": label, "aria-valuemin": "0" });
    const gripStart = grip("start", `Inicio de ${layerName(layer)}`);
    const gripEnd = grip("end", `Fin de ${layerName(layer)}`);
    for (const [node, part] of [[body, "body"], [gripStart, "start"], [gripEnd, "end"]]) {
      node.addEventListener("pointerdown", onTrackPartDown(id, part));
      node.addEventListener("pointermove", onTrackPartMove);
      node.addEventListener("pointerup", onTrackPartUp);
      node.addEventListener("pointercancel", onTrackPartUp);
      node.addEventListener("keydown", onTrackPartKey(id, part));
    }
    body.addEventListener("click", () => selectLayer(id));
    return el("li", { class: "lt-row", "data-id": String(id) }, [body, gripStart, gripEnd]);
  }
  function onTrackPartDown(id, part) {
    return (event) => {
      if (!state.loaded || event.button !== 0) return;
      event.stopPropagation();
      if (part !== "body") event.preventDefault();
      const layer = layerById(id);
      if (!layer) return;
      selectLayer(id);
      const v = video();
      state.trackDrag = { id, part, pointerId: event.pointerId, startX: event.clientX, times: { start: layer.start, end: layer.end }, wasPlaying: Boolean(v && !v.paused), moved: false };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (_) {
        state.trackDrag = null; // the row was rebuilt under the pointer
      }
    };
  }
  function onTrackPartMove(event) {
    const drag = state.trackDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      pausePreview();
    }
    const len = clipLength();
    const times = M().dragTrack(drag.times, drag.part, (dx / (state.trackW || 1)) * len, len);
    const layer = layerById(drag.id);
    if (!layer || (times.start === layer.start && times.end === layer.end)) return;
    setLayer(drag.id, { ...layer, ...times });
    positionTracks();
    // Show the frame at the edge being dragged, so the user sees where the layer appears.
    state.pendingSeek = state.range.start + (drag.part === "end" ? Math.max(times.start, times.end - 0.04) : times.start);
  }
  function onTrackPartUp(event) {
    const drag = state.trackDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.trackDrag = null;
    if (!drag.moved) return;
    commitEdit();
    if (drag.wasPlaying) playRange();
  }
  function onTrackPartKey(id, part) {
    return (event) => {
      const layer = layerById(id);
      if (!layer) return;
      const steps = { ArrowLeft: -0.1, ArrowDown: -0.1, ArrowRight: 0.1, ArrowUp: 0.1 };
      if (!(event.key in steps)) return;
      event.preventDefault();
      if (state.selectedId !== id) selectLayer(id);
      const len = clipLength();
      const times = M().dragTrack(layer, part, steps[event.key] * (event.shiftKey ? 10 : 1), len);
      setLayer(id, { ...layer, ...times });
      commitEdit(`track:${id}:${part}`);
      positionTracks();
      seekTo(state.range.start + (part === "end" ? Math.max(times.start, times.end - 0.04) : times.start));
    };
  }

  // ---------- selection box over the preview ----------
  function updateOverlay() {
    const r = state.refs;
    if (!r.sel) return;
    const layer = selectedLayer();
    const W = state.stageW;
    if (!layer || !W) {
      if (!r.sel.hidden) r.sel.hidden = true;
      state.overlayKey = "";
      return;
    }
    const box = boxOf(layer);
    const w = Math.max(box.w * W, 28);
    const h = Math.max(box.h * W, 28);
    const x = box.x * W - w / 2;
    const y = box.y * W - h / 2;
    const offscreen = !isShown(layer, currentRel());
    const empty = layer.type === "text" && !layer.text.trim();
    const key = `${layer.id}|${x.toFixed(1)}|${y.toFixed(1)}|${w.toFixed(1)}|${h.toFixed(1)}|${offscreen}|${empty}|${layer.scale}`;
    if (key === state.overlayKey) return;
    state.overlayKey = key;
    r.sel.hidden = false;
    r.sel.style.inlineSize = `${w}px`;
    r.sel.style.blockSize = `${h}px`;
    r.sel.style.transform = `translate(${x}px, ${y}px)`;
    r.sel.dataset.offscreen = String(offscreen);
    r.selPh.hidden = !empty;
    if (empty) r.selPh.style.fontSize = `${Math.max(12, layer.scale * W * 0.8)}px`;
    r.selDel.setAttribute("aria-label", `Borrar ${layerName(layer)}`);
  }

  // ---------- panel keys ----------
  // Escape steps back: stop typing, then drop the selection, and only then close the panel.
  function handleEscape(event) {
    const r = state.refs;
    if (state.step !== 2) return false;
    if (event.target === r.textInput) {
      finishTextEdit();
      return true;
    }
    if (state.selectedId !== null) {
      const active = state.shadow.activeElement;
      selectLayer(null);
      if (active && active.classList && active.classList.contains("lt-grip")) r.canvas.focus({ preventScroll: true });
      return true;
    }
    return false;
  }
  function onPanelKey(event) {
    if (event.key === "Escape") {
      if (!handleEscape(event)) hide();
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey || state.step !== 2) return;
    const target = event.target;
    // Text fields keep their own native undo.
    if (target && (target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && target.type !== "range"))) return;
    const key = String(event.key).toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      event.preventDefault();
      redo();
    }
  }

  // Arrow keys move focus inside a group of buttons (roving tabindex); Enter/Space activate.
  function rovingFocus(group, buttons, cols) {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols || 1, ArrowUp: -(cols || 1) };
    buttons.forEach((button, i) => (button.tabIndex = i === 0 ? 0 : -1));
    group.addEventListener("keydown", (event) => {
      const delta = step[event.key];
      const current = buttons.indexOf(state.shadow.activeElement);
      if (!delta || current < 0) return;
      event.preventDefault();
      const next = Math.min(Math.max(current + delta, 0), buttons.length - 1);
      buttons[current].tabIndex = -1;
      buttons[next].tabIndex = 0;
      buttons[next].focus();
    });
  }

  // ---------- chats ----------
  function pollWa() {
    if (state.waTimer || state.waReady) return;
    const check = () => {
      let ready = false;
      try {
        ready = Boolean(requireWa().isReady());
        state.waError = "";
      } catch (error) {
        state.waError = error.message;
      }
      if (ready) {
        root.clearInterval(state.waTimer);
        state.waTimer = null;
        state.waReady = true;
        loadChats();
      } else renderSend();
    };
    state.waTimer = root.setInterval(check, WA_POLL_MS);
    check();
  }

  function loadChats() {
    try {
      const chats = requireWa().listChats();
      state.chats = Array.isArray(chats) ? chats : [];
      state.chatId = M().pickChatId(state.chats, state.chatId);
      state.waError = "";
    } catch (error) {
      state.chats = [];
      state.waError = `No se pudieron leer los chats. Recarga WhatsApp Web e inténtalo de nuevo.`;
      SV.log("error", "ui:list-chats-failed", error);
    }
    renderChats();
    renderSend();
  }

  function chatById(id) {
    return state.chats.find((chat) => chat.id === id) || null;
  }
  const chatName = (chat) => (chat ? chat.name || chat.id : "");

  function avatar(chat) {
    if (chat.isSelf) {
      const node = el("span", { class: "avatar self", "aria-hidden": "true" });
      node.append(icon("person", 20));
      return node;
    }
    const letters = M().initials(chat.name);
    const node = el("span", { class: "avatar", "aria-hidden": "true", text: letters });
    node.style.setProperty("--hue", String(M().avatarHue(chat.name || chat.id)));
    if (!letters) node.append(icon("person", 20));
    return node;
  }

  function selectChat(id, focus) {
    state.chatId = id;
    for (const row of state.refs.chatList.querySelectorAll(".chat")) {
      const on = row.dataset.id === id;
      row.setAttribute("aria-checked", String(on));
      row.tabIndex = on ? 0 : -1;
      if (on && focus) row.focus();
    }
    renderFooter();
  }

  function renderChats() {
    const r = state.refs;
    const query = r.chatSearch.value;
    const matches = M().orderChats(state.chats, query).slice(0, MAX_CHAT_ROWS);
    r.chatList.replaceChildren();
    const focusable = matches.some((chat) => chat.id === state.chatId) ? state.chatId : matches[0] && matches[0].id;
    for (const chat of matches) {
      const check = icon("check", 20);
      check.classList.add("check");
      const meta = chat.isSelf ? "Solo tú lo verás" : chat.isGroup ? "Grupo" : "";
      const row = el(
        "button",
        {
          type: "button",
          class: "chat",
          role: "radio",
          "aria-checked": String(chat.id === state.chatId),
          tabindex: chat.id === focusable ? "0" : "-1",
          "data-id": chat.id,
          onclick: () => selectChat(chat.id),
        },
        [avatar(chat), el("span", { class: "chat-text" }, [el("span", { class: "chat-name", text: chatName(chat) }), meta ? el("span", { class: "chat-meta", text: meta }) : null]), check],
      );
      r.chatList.append(el("li", { role: "none" }, [row]));
    }
    r.chatList.hidden = matches.length === 0;
    r.chatEmpty.hidden = !(state.waReady && state.chats.length && !matches.length);
    if (!r.chatEmpty.hidden) r.chatEmpty.textContent = `Ningún chat coincide con «${query.trim()}».`;
  }

  function onChatKey(event) {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!delta) return;
    const rows = [...state.refs.chatList.querySelectorAll(".chat")];
    if (!rows.length) return;
    event.preventDefault();
    const current = rows.indexOf(state.shadow.activeElement);
    const next = rows[Math.min(Math.max((current < 0 ? 0 : current) + delta, 0), rows.length - 1)];
    selectChat(next.dataset.id, true);
  }

  // ---------- build / send ----------
  function clearResult() {
    const result = state.result;
    if (result) {
      URL.revokeObjectURL(result.webpUrl);
      URL.revokeObjectURL(result.audioUrl);
    }
    state.result = null;
    finishHalftoneNow();
    state.ht = null;
    const r = state.refs;
    if (r.resultImg) {
      r.resultImg.removeAttribute("src");
      r.successImg.removeAttribute("src");
      r.audio.pause();
      r.audio.removeAttribute("src");
    }
  }
  function resetSendState() {
    state.buildError = "";
    state.sendError = "";
    state.sending = false;
    state.sent = false;
    state.sentTo = "";
  }

  function onProgress(event) {
    const info = M().buildProgress(event);
    const r = state.refs;
    if (r.buildLabel.textContent !== info.label) {
      r.buildLabel.textContent = info.label;
      // The recording counter changes every second: announce the phase once, not each tick.
      const phase = `${event && event.phase}|${Boolean(event && Number.isFinite(event.recordedSec))}`;
      if (phase !== state.buildPhase) {
        state.buildPhase = phase;
        announce(info.label);
      }
    }
    // The dot grid eases toward the reported ratio on its own clock; never backwards.
    const ht = state.ht;
    if (ht && info.ratio !== null) {
      ht.target = Math.max(ht.target, info.ratio);
      const ceiling = M().progressCeiling(event);
      if (ceiling !== null) ht.ceiling = Math.max(ht.ceiling, ceiling);
    }
  }

  // ---------- halftone build progress (S12) ----------
  // The first output frame (same crop, layers and shape as the sticker) is sampled on an n×n
  // grid; each cell is a dot that grows with progress and with the frame's tone, so the user's
  // own image emerges. Pure math lives in uiModel; this draws it at up to 30 fps.
  const HT_GRID = 32;
  const HT_FRAME_MS = 1000 / 30;
  const HT_RESOLVE_MS = 340;
  const HT_RESOLVE_REDUCED_MS = 120;
  const HT_FINISH_MAX_MS = 600;

  async function snapshotFirstFrame(layers) {
    const media = SV.media;
    const v = state.loaded && state.loaded.video;
    if (!v || !media || typeof media.drawFrame !== "function") return null;
    try {
      if (Math.abs(v.currentTime - state.range.start) > 0.04) {
        v.currentTime = state.range.start;
        await once(v, "seeked", 1500);
      }
      if (v.readyState < 2) return null;
      const size = HT_GRID * 8;
      const big = doc.createElement("canvas");
      big.width = big.height = size;
      media.drawFrame(big.getContext("2d"), v, state.crop, layers, 0, size, { shape: state.shape, outline: state.outline });
      const small = doc.createElement("canvas");
      small.width = small.height = HT_GRID;
      const ctx = small.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(big, 0, 0, HT_GRID, HT_GRID);
      return ctx.getImageData(0, 0, HT_GRID, HT_GRID).data;
    } catch (error) {
      SV.log("warn", "ui:halftone-snapshot-failed", error);
      return null;
    }
  }

  function htColors(ht) {
    const theme = state.host ? state.host.dataset.theme : "light";
    if (ht.colors && ht.colors.theme === theme) return ht.colors;
    const css = root.getComputedStyle(state.refs.progress);
    const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const dark = theme === "dark";
    ht.colors = { theme, tile: read("--sv-ht-tile", dark ? "#202c33" : "#ffffff"), dot: read("--sv-ht-dot", dark ? "#00a884" : "#008069") };
    ht.samples = M().halftoneSamples(ht.data, HT_GRID, dark);
    return ht.colors;
  }

  function setProgressValue(shown) {
    const pct = Math.floor(shown * 100 + 1e-6);
    if (pct === state.ht.pct) return;
    state.ht.pct = pct;
    state.refs.buildPct.textContent = `${pct} %`;
    state.refs.progress.setAttribute("aria-valuenow", String(pct));
  }

  function drawHalftone(now) {
    const ht = state.ht;
    const canvas = state.refs.halftone;
    const cssSize = canvas.clientWidth;
    if (!cssSize) return;
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const W = Math.round(cssSize * dpr);
    if (canvas.width !== W || canvas.height !== W) canvas.width = canvas.height = W;
    const ctx = canvas.getContext("2d");
    const colors = htColors(ht);
    const reduce = reducedMotion();
    // Resolve: dots shrink and fade while the sticker scales in on top (reduced motion: fade only).
    const resolveMs = reduce ? HT_RESOLVE_REDUCED_MS : HT_RESOLVE_MS;
    const k = ht.resolveAt ? Math.min(1, (now - ht.resolveAt) / resolveMs) : 0;
    const ease = 1 - (1 - k) * (1 - k);
    const fade = 1 - ease;
    const shrink = reduce ? 1 : 1 - 0.75 * ease;
    const t = (now - ht.t0) / 1000;
    ctx.clearRect(0, 0, W, W);
    ctx.globalAlpha = fade;
    ctx.fillStyle = colors.tile;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, W, W, 18 * dpr);
    else ctx.rect(0, 0, W, W);
    ctx.fill();
    ctx.fillStyle = colors.dot;
    // Pure layout: fixed grid, soft sweep, softened tone (uiModel.halftoneFrame).
    const frame = M().halftoneFrame(ht.samples, ht.shown, W, { reduce, time: reduce || ht.resolveAt ? undefined : t });
    for (const dot of frame.dots) {
      if (dot.r < 0.25 * dpr) continue;
      ctx.globalAlpha = dot.a * fade;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r * shrink, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function startHalftone() {
    if (state.htRaf || !state.ht || state.ht.done) return;
    state.htLast = 0;
    state.htRaf = root.requestAnimationFrame(htTick);
  }
  function stopHalftone() {
    if (state.htRaf) root.cancelAnimationFrame(state.htRaf);
    state.htRaf = 0;
  }
  function htTick(now) {
    state.htRaf = 0;
    const ht = state.ht;
    if (!ht || ht.done || state.step !== 3 || !state.host || state.host.hidden) return;
    if (state.htLast && now - state.htLast < HT_FRAME_MS - 2) {
      state.htRaf = root.requestAnimationFrame(htTick);
      return;
    }
    const dt = state.htLast ? Math.min(now - state.htLast, 100) : 16;
    state.htLast = now;
    if (!ht.t0) ht.t0 = now;
    ht.shown = M().smoothProgress(ht.shown, ht.target, dt, { ceiling: ht.ceiling, fast: ht.finishing });
    if (ht.finishing && !ht.resolveAt) {
      if (!ht.finishAt) ht.finishAt = now;
      if (ht.shown >= 0.995 || now - ht.finishAt > HT_FINISH_MAX_MS) {
        ht.shown = 1;
        ht.resolveAt = now;
        revealSticker();
      }
    }
    setProgressValue(ht.shown);
    drawHalftone(now);
    if (ht.resolveAt && now - ht.resolveAt >= (reducedMotion() ? HT_RESOLVE_REDUCED_MS : HT_RESOLVE_MS)) {
      ht.done = true;
      renderSend();
      return;
    }
    state.htRaf = root.requestAnimationFrame(htTick);
  }
  // The real animated sticker lands where the dots were: 0.96 → 1 and a fade, under 400 ms.
  function revealSticker() {
    const r = state.refs;
    r.progress.dataset.resolving = "true";
    renderSend();
    r.resultImg.removeAttribute("src");
    if (state.result) r.resultImg.src = state.result.webpUrl; // restart the animation on landing
    animateIn(r.sticker, "scale(.96)", HT_RESOLVE_MS);
    animateIn(r.resultActions, "translateY(4px)", 260);
  }
  // Skips the animation (leaving step 3, or no frames to draw) and shows the final state.
  function finishHalftoneNow() {
    stopHalftone();
    if (state.ht) state.ht.done = true;
  }

  async function startBuild() {
    if (!state.loaded || state.building) return;
    cancelEstimate();
    const v = state.loaded.video;
    v.pause();
    clearResult();
    resetSendState();
    state.building = true;
    state.buildPhase = "frames|false";
    const r = state.refs;
    r.buildLabel.textContent = "Preparando cuadros…";
    finishHalftoneNow();
    state.ht = { data: null, samples: null, colors: null, shown: 0, target: 0, ceiling: M().progressCeiling({ phase: "frames" }), pct: -1, t0: 0, finishing: false, finishAt: 0, resolveAt: 0, done: false };
    setProgressValue(0);
    r.progress.dataset.resolving = "false";
    renderAll();
    announce("Creando tu sticker…");
    const version = state.editVersion;
    const loaded = state.loaded;
    const layers = M().normalizeLayers(state.layers, clipLength());
    const ht = state.ht;
    // Snapshot before buildSticker seeks the video; without it the grid is even (no picture).
    ht.data = await snapshotFirstFrame(layers);
    ht.colors = null;
    startHalftone();
    try {
      const out = await requireMedia().buildSticker({
        file: state.file,
        video: v,
        start: state.range.start,
        end: state.range.end,
        crop: { ...state.crop },
        layers,
        shape: state.shape,
        outline: state.outline,
        normalize: state.normalize,
        onProgress,
      });
      if (version !== state.editVersion || loaded !== state.loaded) return; // stale build
      state.result = {
        webp: out.webp,
        audio: out.audio,
        durationSec: out.durationSec,
        webpUrl: URL.createObjectURL(out.webp),
        audioUrl: URL.createObjectURL(out.audio),
        version,
      };
      r.resultImg.src = state.result.webpUrl;
      r.successImg.src = state.result.webpUrl;
      r.audio.src = state.result.audioUrl;
      r.resultMeta.textContent = `${fmtSec(out.durationSec)} · ${fmtBytes(out.webp.size + out.audio.size)}`;
      r.resultMeta.title = `Sticker ${fmtBytes(out.webp.size)} · audio ${fmtBytes(out.audio.size)}`;
      announce("Sticker listo. Elige un chat para enviarlo.");
    } catch (error) {
      SV.log("error", "ui:build-sticker-failed", error);
      state.buildError = (error && error.message) || "No se pudo crear el sticker. Vuelve a intentarlo.";
      announce(state.buildError);
    } finally {
      state.building = false;
      if (state.ht === ht) {
        if (state.result) {
          // Finish the count to 100 %, then resolve into the sticker (see htTick).
          ht.target = 1;
          ht.finishing = true;
          if (state.step === 3 && !state.host.hidden) startHalftone();
          else finishHalftoneNow();
        } else finishHalftoneNow();
      }
      renderAll();
    }
  }

  function listen() {
    const r = state.refs;
    if (!state.result) return;
    if (!r.audio.paused) {
      r.audio.pause();
      setListenButton(false);
      return;
    }
    // Restart the WebP animation and the audio together.
    r.resultImg.removeAttribute("src");
    r.resultImg.src = state.result.webpUrl;
    r.audio.currentTime = 0;
    const promise = r.audio.play();
    setListenButton(true);
    if (promise && promise.catch) {
      promise.catch((error) => {
        SV.log("warn", "ui:preview-audio-failed", error);
        setListenButton(false);
      });
    }
  }
  function setListenButton(playing) {
    setButton(state.refs.listen, playing ? "pause" : "volume", playing ? "Detener" : "Escuchar", 18);
  }

  async function send() {
    if (!state.result || state.sending || state.building || !state.chatId) return;
    const chat = chatById(state.chatId);
    state.sending = true;
    state.sendError = "";
    renderAll();
    announce("Enviando…");
    try {
      const outcome = await requireWa().sendSoundSticker({
        chatId: state.chatId,
        webp: state.result.webp,
        audio: state.result.audio,
        durationSec: state.result.durationSec,
      });
      if (outcome && outcome.ok) {
        state.sent = true;
        state.sentTo = chatName(chat) || "el chat";
        announce(`Enviado a ${state.sentTo}.`);
      } else {
        state.sendError = `No se pudo enviar (${(outcome && outcome.error) || "error desconocido"}). Revisa tu conexión y vuelve a intentarlo.`;
      }
    } catch (error) {
      SV.log("error", "ui:send-failed", error);
      state.sendError = `No se pudo enviar (${(error && error.message) || error}). Revisa tu conexión y vuelve a intentarlo.`;
    } finally {
      state.sending = false;
      if (state.sendError) announce(state.sendError);
      renderAll();
      if (state.sent) {
        state.refs.audio.pause();
        state.refs.successTitle.focus({ preventScroll: true });
      }
    }
  }

  function createAnother() {
    clearResult();
    resetSendState();
    state.layers = [];
    state.selectedId = null;
    state.shape = "square";
    state.outline = false;
    if (state.loaded) {
      state.crop = M().defaultCrop(state.loaded.width, state.loaded.height);
      updateZoomSlider();
    }
    markEdited();
    resetHistory();
    syncEditor();
    goTo(1);
  }

  // ---------- navigation ----------
  function goTo(step) {
    const next = M().clampStep(step, Boolean(state.loaded));
    const prev = state.step;
    if (prev === 2 && next !== 2) {
      state.wasPlaying = false;
      pausePreview();
      stopLoop();
      cancelEstimate();
    }
    if (next === 2 && state.refs.audio) state.refs.audio.pause();
    // Leaving step 3 mid-resolve skips the rest of the animation.
    if (prev === 3 && next !== 3 && state.result) finishHalftoneNow();
    state.step = next;
    const r = state.refs;
    for (const [n, view] of Object.entries(r.views)) view.hidden = Number(n) !== next;
    r.body.scrollTop = 0;
    if (prev !== next) animateIn(r.views[next], `translateX(${next > prev ? 16 : -16}px)`, 220);
    renderAll();
    if (next === 2) {
      scheduleEstimate();
      root.setTimeout(dismissHint, 4000);
      root.requestAnimationFrame(() => {
        measureTrack();
        measureStage();
        drawFilmstrip();
        state.drawKey = "";
        startLoop();
      });
    }
    if (next === 3) {
      if (!state.result || state.result.version !== state.editVersion) {
        if (!state.building) startBuild();
      }
      if (state.waReady) loadChats();
      else pollWa();
      startHalftone();
    }
    if (prev !== next) {
      r.title.focus({ preventScroll: true });
      announce(`Paso ${next} de 3: ${STEP_TITLES[next]}`);
    }
  }
  function goBack() {
    if (state.building || state.sending) return;
    goTo(state.step - 1);
    if (state.step === 2) playRange();
  }

  // ---------- render ----------
  function renderAll() {
    renderHeader();
    renderStep1();
    renderSend();
    renderFooter();
  }

  function renderHeader() {
    const r = state.refs;
    const success = state.step === 3 && state.sent;
    r.title.textContent = success ? "¡Listo!" : STEP_TITLES[state.step];
    const showBack = state.step > 1 && !success;
    r.back.dataset.invisible = String(!showBack);
    r.back.disabled = !showBack || state.building || state.sending;
    r.back.setAttribute("aria-hidden", String(!showBack));
    r.back.tabIndex = showBack ? 0 : -1;
    r.stepItems.forEach((item, i) => {
      const n = i + 1;
      const done = n < state.step || success;
      if (n === state.step && !success) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      item.dataset.done = String(done);
      const num = item.querySelector(".step-num");
      if (done) num.replaceChildren(icon("check", 12));
      else num.textContent = String(n);
    });
  }

  function renderStep1() {
    const r = state.refs;
    if (!r.choose) return;
    r.choose.disabled = state.loading;
    r.choose.setAttribute("aria-busy", String(state.loading));
    setButton(r.choose, state.loading ? "spinner" : null, state.loading ? "Abriendo video…" : "Elige un video");
    r.loadError.hidden = !state.loadError;
    r.loadErrorText.textContent = state.loadError;
    r.resume.hidden = !state.loaded || state.loading;
  }

  function renderSend() {
    const r = state.refs;
    if (!r.resultBox) return;
    const view = M().sendViewState({
      building: state.building,
      buildError: state.buildError,
      result: Boolean(state.result),
      waReady: state.waReady,
      sending: state.sending,
      sendError: state.sendError,
      sent: state.sent,
    });
    r.sendMain.hidden = view === "success";
    r.success.hidden = view !== "success";
    if (view === "success") r.successText.textContent = `Enviado a ${state.sentTo}`;

    const ht = state.ht;
    const failed = Boolean(state.buildError);
    // The sticker shows once the dots resolve (or right away when there is no animation).
    const revealed = Boolean(state.result) && !(ht && !ht.resolveAt && !ht.done);
    r.resultStage.hidden = failed;
    r.stageFoot.hidden = failed;
    r.progress.hidden = failed || !ht || ht.done;
    r.buildLabel.hidden = failed || revealed || !ht;
    r.sticker.hidden = !revealed;
    r.resultActions.hidden = !revealed;
    r.buildErrorBox.hidden = !state.buildError;
    r.buildErrorText.textContent = state.buildError;
    r.sendErrorBox.hidden = !state.sendError;
    r.sendErrorText.textContent = state.sendError;

    const waiting = !state.waReady;
    r.chatWaiting.hidden = !waiting || Boolean(state.waError);
    r.chatProblem.hidden = !state.waError;
    r.chatProblemText.textContent = state.waError;
    r.chatSearch.disabled = waiting;
    r.picker.toggleAttribute("inert", state.sending);
    r.picker.hidden = Boolean(state.buildError);
    if (waiting) r.chatList.hidden = true;
  }

  function renderFooter() {
    const r = state.refs;
    if (!r.footer) return;
    const success = state.step === 3 && state.sent;
    r.footContinue.hidden = state.step !== 2;
    r.footSend.hidden = state.step !== 3 || success;
    r.footAnother.hidden = !success;
    r.footClose.hidden = !success;
    r.footer.hidden = state.step === 1;
    if (state.step !== 3 || success) return;
    const chat = chatById(state.chatId);
    const button = r.footSend;
    if (state.sending) setButton(button, "spinner", "Enviando…");
    else if (state.building) setButton(button, null, "Creando sticker…");
    else if (!state.waReady) setButton(button, null, "Esperando a WhatsApp Web…");
    else setButton(button, null, chat ? `Enviar a ${chatName(chat)}` : "Elige un chat");
    button.setAttribute("aria-busy", String(state.sending));
    button.disabled = state.sending || state.building || !state.result || !state.waReady || !chat;
  }

  // ---------- build DOM ----------
  function buildHeader() {
    const r = state.refs;
    r.back = el("button", { type: "button", class: "icon-btn", "aria-label": "Volver", title: "Volver", onclick: goBack }, [icon("back", 22)]);
    r.close = el("button", { type: "button", class: "icon-btn", "aria-label": "Cerrar StickerVox", title: "Cerrar", onclick: hide }, [icon("close", 22)]);
    r.title = el("h2", { class: "title", id: "sv-title", tabindex: "-1", text: STEP_TITLES[1] });
    r.stepItems = STEP_LABELS.map((label, i) => el("li", {}, [el("span", { class: "step-num", "aria-hidden": "true", text: String(i + 1) }), el("span", { text: label })]));
    const steps = el("ol", { class: "steps", "aria-label": "Pasos" }, r.stepItems);
    return el("header", { class: "header" }, [r.back, el("div", { class: "header-main" }, [r.title, steps]), r.close]);
  }

  function errorNotice(textRef, action) {
    const text = el("p", {});
    const box = el("div", { class: "notice", role: "alert" }, [icon("alert", 20), el("div", { class: "grow" }, [text, action || null])]);
    box.hidden = true;
    state.refs[textRef] = text;
    return box;
  }

  function buildStep1() {
    const r = state.refs;
    r.fileInput = el("input", {
      type: "file",
      accept: "video/*",
      class: "sr-only",
      tabindex: "-1",
      "aria-hidden": "true",
      onchange: () => {
        handleFile(r.fileInput.files && r.fileInput.files[0]);
        r.fileInput.value = "";
      },
    });
    r.choose = el("button", { type: "button", class: "btn btn-primary btn-lg", onclick: () => r.fileInput.click() });
    const art = el("div", { class: "drop-art", "aria-hidden": "true" }, [icon("film", 40), el("span", { class: "badge" }, [icon("plus", 16)])]);
    r.loadError = errorNotice("loadErrorText");
    r.drop = el("div", { class: "drop" }, [
      r.fileInput,
      art,
      el("div", { class: "drop-copy" }, [
        el("p", { class: "h-xl", text: "Convierte un video en sticker con sonido" }),
        el("p", { class: "muted", text: "Elige un clip corto. Luego lo recortas, le pones texto y lo envías." }),
      ]),
      el("div", { class: "drop-actions" }, [r.choose, el("p", { class: "muted", text: "o arrástralo aquí" })]),
      el("p", { class: "drop-meta", text: `MP4, WebM o MOV · se usan hasta ${round1(maxClipSec())} s` }),
      r.loadError,
    ]);
    r.resumeName = el("span", { class: "grow", text: "" });
    r.resume = el("div", { class: "resume" }, [
      icon("film", 20),
      r.resumeName,
      el("button", {
        type: "button",
        class: "btn btn-quiet btn-sm",
        text: "Seguir editando",
        onclick: () => {
          goTo(2);
          playRange();
        },
      }),
    ]);
    r.resume.hidden = true;
    return el("div", { class: "view", "data-step": "1" }, [r.drop, r.resume]);
  }

  function measureStage() {
    const canvas = state.refs.canvas;
    const width = canvas ? canvas.clientWidth : 0;
    if (width && width !== state.stageW) {
      state.stageW = width;
      state.viewVersion++;
    }
  }

  // Undo/redo on the left, playhead time and clip length on the right.
  function buildEditBar() {
    const r = state.refs;
    r.undo = el("button", { type: "button", class: "icon-btn", "aria-label": "Deshacer", title: "Deshacer (Ctrl+Z)", disabled: true, onclick: undo }, [icon("undo", 20)]);
    r.redo = el("button", { type: "button", class: "icon-btn", "aria-label": "Rehacer", title: "Rehacer (Ctrl+Mayús+Z)", disabled: true, onclick: redo }, [icon("redo", 20)]);
    r.play = el("button", { type: "button", class: "icon-btn play", onclick: togglePlay });
    r.mute = el("button", { type: "button", class: "icon-btn", "data-muted": "false", "aria-label": "Silenciar", title: "Silenciar", onclick: toggleMute }, [icon("volume", 20)]);
    r.timeNow = el("span", { class: "muted num", text: fmtSec(0) });
    r.lenValue = el("strong", { text: fmtSec(0) });
    r.lenMax = el("span", { class: "muted", text: "" });
    return el("div", { class: "editbar" }, [
      el("div", { class: "editbar-group", role: "group", "aria-label": "Historial" }, [r.undo, r.redo]),
      el("div", { class: "editbar-group" }, [r.play, r.timeNow, r.mute]),
    ]);
  }

  function buildStage() {
    const r = state.refs;
    const size = outputSize();
    r.canvas = el("canvas", {
      width: String(size),
      height: String(size),
      tabindex: "0",
      role: "img",
      "aria-label":
        "Vista previa del sticker. Arrastra el video para encuadrarlo o toca un texto o emoji para moverlo. Rueda o pellizco: acercar, o cambiar el tamaño de lo seleccionado. Con teclado: flechas para mover, + y − para el tamaño, Supr para borrar, Escape para soltar la selección, espacio para reproducir.",
    });
    r.ctx = r.canvas.getContext("2d");
    r.canvas.addEventListener("pointerdown", onStageDown);
    r.canvas.addEventListener("pointermove", onStageMove);
    r.canvas.addEventListener("pointerup", onStageUp);
    r.canvas.addEventListener("pointercancel", onStageUp);
    r.canvas.addEventListener("dblclick", onStageDblClick);
    r.canvas.addEventListener("wheel", onStageWheel, { passive: false });
    r.canvas.addEventListener("keydown", onStageKey);
    if (typeof root.ResizeObserver === "function") new root.ResizeObserver(measureStage).observe(r.canvas);

    // Selection box: follows the selected layer; only its two handles take pointer input.
    r.selPh = el("span", { class: "sel-ph", "aria-hidden": "true", text: "Tu texto" });
    r.selDel = el("button", { type: "button", class: "sel-del", "aria-label": "Borrar", title: "Borrar", onclick: () => state.selectedId !== null && deleteLayer(state.selectedId) }, [icon("close", 16)]);
    r.selSize = el("div", { class: "sel-size", "aria-hidden": "true", title: "Arrastra para cambiar el tamaño" });
    r.selSize.addEventListener("pointerdown", onSizeDown);
    r.selSize.addEventListener("pointermove", onSizeMove);
    r.selSize.addEventListener("pointerup", onSizeUp);
    r.selSize.addEventListener("pointercancel", onSizeUp);
    r.sel = el("div", { class: "sel" }, [r.selPh, r.selDel, r.selSize]);
    r.sel.hidden = true;

    r.stageHint = el("p", { class: "stage-hint", "aria-hidden": "true", text: "Arrastra para encuadrar" });
    updatePlayButton();
    r.stage = el("div", { class: "stage", "data-shape": "square" }, [r.canvas, r.stageHint, r.sel]);
    return el("div", { class: "stage-wrap" }, [r.stage]);
  }

  function buildTimeline() {
    const r = state.refs;
    r.film = el("canvas", { class: "film", "aria-hidden": "true", width: "8", height: "1" });
    r.shadeL = el("div", { class: "shade left" });
    r.shadeR = el("div", { class: "shade right" });
    r.window = el("div", { class: "window" });
    r.playhead = el("div", {
      class: "playhead",
      role: "slider",
      tabindex: "0",
      "aria-label": "Posición de reproducción",
      "aria-valuemin": "0",
      "aria-valuemax": "0",
      "aria-valuenow": "0",
    });
    r.playhead.addEventListener("keydown", onTrackKey);
    const handle = (which, label) => {
      const node = el("div", {
        class: `handle ${which}`,
        role: "slider",
        tabindex: "0",
        "aria-label": label,
        "aria-valuemin": "0",
        "aria-valuemax": "0",
        "aria-valuenow": "0",
      });
      node.addEventListener("pointerdown", onHandleDown(which));
      node.addEventListener("pointermove", onHandleMove);
      node.addEventListener("pointerup", onHandleUp);
      node.addEventListener("pointercancel", onHandleUp);
      node.addEventListener("keydown", onHandleKey(which));
      return node;
    };
    r.handleStart = handle("start", "Inicio del clip");
    r.handleEnd = handle("end", "Fin del clip");
    r.track = el("div", { class: "track" }, [r.film, r.shadeL, r.shadeR, r.window, r.playhead, r.handleStart, r.handleEnd]);
    r.track.addEventListener("pointerdown", onTrackDown);
    r.track.addEventListener("pointermove", onTrackMove);
    r.track.addEventListener("pointerup", onTrackUp);
    r.track.addEventListener("pointercancel", onTrackUp);
    if (typeof root.ResizeObserver === "function") new root.ResizeObserver(measureTrack).observe(r.track);

    // Whole-video overview (long videos): where the selection is; drag or use arrows to move it.
    r.ovView = el("div", { class: "ov-view" });
    r.ovSel = el("div", { class: "ov-sel" });
    r.overview = el(
      "div",
      {
        class: "ov-track",
        role: "slider",
        tabindex: "0",
        "aria-label": "Ubicación del fragmento en el video completo",
        "aria-valuemin": "0",
        "aria-valuemax": "0",
        "aria-valuenow": "0",
        title: "Arrastra para elegir otra parte del video",
      },
      [r.ovView, r.ovSel],
    );
    r.overview.addEventListener("pointerdown", onOvDown);
    r.overview.addEventListener("pointermove", onOvMove);
    r.overview.addEventListener("pointerup", onOvUp);
    r.overview.addEventListener("pointercancel", onOvUp);
    r.overview.addEventListener("keydown", onOvKey);
    r.ovRange = el("span", { class: "ov-range" });
    r.ovEnd = el("span", { text: "0:00" });
    r.ov = el("div", { class: "ov" }, [
      r.overview,
      el("div", { class: "ov-labels num", "aria-hidden": "true" }, [el("span", { text: "0:00" }), r.ovRange, r.ovEnd]),
    ]);
    r.ov.hidden = true;

    // One slim track per layer: the bar spans the clip time where the layer shows.
    r.ltHead = el("li", { class: "lt-head", "aria-hidden": "true" });
    r.ltList = el("ul", { class: "lt-list", "aria-label": "Cuándo aparece cada texto o emoji" }, [r.ltHead]);
    r.ltSelName = el("span", { class: "lt-sel-name" });
    const edge = (which, label) =>
      el("button", {
        type: "button",
        class: "btn btn-secondary btn-sm",
        text: label,
        "aria-label": `${label}: lo seleccionado ${which === "start" ? "empieza" : "termina"} en la posición actual`,
        onclick: () => setLayerEdge(which),
      });
    r.ltActions = el("div", { class: "lt-actions" }, [r.ltSelName, edge("start", "Empieza aquí"), edge("end", "Termina aquí")]);
    r.ltActions.hidden = true;
    r.lt = el("div", { class: "lt" }, [r.ltList]);
    r.lt.hidden = true;
    r.ruler = el("div", { class: "ruler num", "aria-hidden": "true" });
    return el("div", { class: "timeline" }, [buildClipMeta(), el("div", { class: "track-wrap" }, [r.ov, r.ruler, r.track, r.lt]), r.ltActions]);
  }

  // Clip length and, next to it, the estimated smoothness of the result (S13 b). The visible chip
  // is decorative for screen readers; the status line below reads finished estimates politely.
  function buildClipMeta() {
    const r = state.refs;
    r.estBars = [0, 1, 2, 3].map((i) => el("i", { "data-on": "false", style: `--h: ${40 + i * 20}%` }));
    r.estText = el("span", { class: "est-text", text: "Calculando…" });
    r.est = el("span", { class: "chip est", "data-level": "pending", "aria-hidden": "true", title: "Fluidez estimada del sticker dentro del límite de tamaño" }, [
      el("span", { class: "est-bars" }, r.estBars),
      r.estText,
    ]);
    r.est.hidden = true;
    r.estLive = el("span", { class: "sr-only", role: "status", "aria-live": "polite" });
    return el("div", { class: "clip-meta" }, [el("span", { class: "chip", "aria-label": "Duración del clip" }, [r.lenValue, r.lenMax]), r.est, r.estLive]);
  }

  // Tool bar under the preview: one tool panel visible at a time. "Texto" also adds a text.
  function buildTools() {
    const r = state.refs;
    const defs = [
      ["frame", "Encuadre", "frame", buildFramePanel()],
      ["text", "Texto", "text", buildTextPanel()],
      ["emoji", "Emoji", "emoji", buildEmojiPanel()],
      ["shape", "Forma", "shape", buildShapePanel()],
      ["sound", "Sonido", "volume", buildSoundPanel()],
    ];
    const tabs = [];
    const panels = [];
    defs.forEach(([key, label, iconName, content], i) => {
      const tab = el(
        "button",
        {
          type: "button",
          role: "tab",
          class: "tool",
          id: `sv-tab-${key}`,
          "aria-controls": `sv-panel-${key}`,
          "aria-selected": String(i === 0),
          tabindex: i === 0 ? "0" : "-1",
          onclick: () => (key === "text" ? addTextLayer() : selectTool(key)),
        },
        [icon(iconName, 22), el("span", { text: label })],
      );
      const panel = el("div", { class: "tabpanel", role: "tabpanel", id: `sv-panel-${key}`, "aria-labelledby": `sv-tab-${key}` }, content);
      panel.hidden = i !== 0;
      tabs.push(tab);
      panels.push(panel);
    });
    function selectTool(key, focus) {
      const prev = state.tool;
      state.tool = key;
      defs.forEach(([k], i) => {
        const on = k === key;
        tabs[i].setAttribute("aria-selected", String(on));
        tabs[i].tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
        if (on && focus) tabs[i].focus();
        if (on && prev !== key) animateIn(panels[i], "translateY(4px)", 180);
      });
    }
    const list = el("div", { class: "tools", role: "tablist", "aria-label": "Herramientas" }, tabs);
    list.addEventListener("keydown", (event) => {
      const keys = defs.map(([k]) => k);
      const i = keys.indexOf(state.tool);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      selectTool(keys[(next + keys.length) % keys.length], true);
    });
    r.selectTool = selectTool;
    return [list, ...panels];
  }

  function buildFramePanel() {
    const r = state.refs;
    r.zoom = el("input", { type: "range", class: "slider", min: "1", max: "6.7", step: "0.01", value: "1", "aria-label": "Zoom" });
    r.zoom.addEventListener("input", () => {
      if (!state.loaded) return;
      const short = Math.min(state.loaded.width, state.loaded.height);
      applyZoom(state.crop.size / (short / parseFloat(r.zoom.value)));
    });
    r.zoom.addEventListener("change", () => commitEdit());
    const zoomBtn = (name, label, factor) =>
      el("button", { type: "button", class: "icon-btn", "aria-label": label, title: label, onclick: () => (applyZoom(factor), commitEdit("zoom")) }, [icon(name, 20)]);
    const center = el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: resetCrop });
    setButton(center, "center", "Centrar", 16);
    return [
      el("div", { class: "zoom-row" }, [zoomBtn("minus", "Alejar", 1 / KEY_ZOOM), r.zoom, zoomBtn("plus", "Acercar", KEY_ZOOM), center]),
      el("p", { class: "hint", text: "Arrastra el video para moverlo. Usa la rueda del ratón o pellizca para acercar." }),
    ];
  }

  function buildTextPanel() {
    const r = state.refs;
    r.textInput = el("input", {
      type: "text",
      class: "layer-input",
      maxlength: "80",
      placeholder: "Escribe tu texto",
      "aria-label": "Texto seleccionado",
      autocomplete: "off",
      spellcheck: "true",
      enterkeyhint: "done",
      oninput: onTextInput,
      onkeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finishTextEdit();
        }
      },
    });
    r.textDone = el("button", { type: "button", class: "btn btn-quiet btn-sm", text: "Listo", onclick: finishTextEdit });
    r.textEdit = el("div", { class: "text-edit" }, [r.textInput, r.textDone]);

    // Style presets: the starting point instead of a blank canvas.
    r.styleButtons = TEXT_STYLE_OPTIONS.map(([key, label]) =>
      el("button", { type: "button", class: "style-chip", "data-value": key, "aria-pressed": "false", onclick: () => applyStyle(key) }, [
        el("span", { class: "style-prev", "data-style": key, "aria-hidden": "true", text: "Aa" }),
        el("span", { text: label }),
      ]),
    );
    const styleRow = el("div", { class: "style-row", role: "group", "aria-label": "Estilo del texto" }, r.styleButtons);
    rovingFocus(styleRow, r.styleButtons);

    r.colorButtons = COLOR_OPTIONS.map(([value, label]) => {
      const button = el("button", { type: "button", class: "swatch", "data-value": value, "aria-pressed": "false", "aria-label": label, title: label, onclick: () => applyColor(value) });
      button.style.setProperty("--swatch", value);
      return button;
    });
    r.colorRow = el("div", { class: "color-row", role: "group", "aria-label": "Color del texto" }, r.colorButtons);
    rovingFocus(r.colorRow, r.colorButtons);

    const add = el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => addTextLayer() });
    setButton(add, "plus", "Añadir texto", 16);
    r.textStart = el("div", { class: "text-start" }, [el("p", { class: "hint", text: "Elige un estilo o toca un texto de la vista previa para cambiarlo." }), add]);
    return [r.textEdit, styleRow, r.colorRow, r.textStart];
  }

  function buildEmojiPanel() {
    const r = state.refs;
    r.emojiButtons = EMOJI_OPTIONS.map(([char, name]) => el("button", { type: "button", class: "emoji-btn", "aria-label": name, title: name, text: char, onclick: () => addEmojiLayer(char, name) }));
    const grid = el("div", { class: "emoji-grid", role: "group", "aria-label": "Emojis" }, r.emojiButtons);
    rovingFocus(grid, r.emojiButtons, EMOJI_COLS);
    return [grid];
  }

  function buildShapePanel() {
    const r = state.refs;
    r.shapeButtons = SHAPE_OPTIONS.map(([key, label]) =>
      el("button", { type: "button", class: "shape-opt", role: "radio", "data-value": key, "aria-checked": String(key === "square"), onclick: () => setShape(key) }, [
        el("span", { class: "shape-glyph", "data-shape": key, "aria-hidden": "true" }),
        el("span", { text: label }),
      ]),
    );
    const group = el("div", { class: "shape-row", role: "radiogroup", "aria-label": "Forma del sticker" }, r.shapeButtons);
    group.addEventListener("keydown", (event) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const keys = SHAPE_OPTIONS.map(([key]) => key);
      const next = keys[(keys.indexOf(state.shape) + delta + keys.length) % keys.length];
      setShape(next);
      r.shapeButtons[keys.indexOf(next)].focus();
    });
    const label = el("strong", { id: "sv-outline-label", text: "Borde blanco" });
    r.outlineSwitch = el("button", { type: "button", class: "switch", role: "switch", "aria-checked": "false", "aria-labelledby": "sv-outline-label", "aria-describedby": "sv-outline-desc" });
    r.outlineSwitch.addEventListener("click", () => {
      state.outline = !state.outline;
      markEdited();
      commitEdit();
      syncShapePanel();
    });
    return [
      group,
      el("div", { class: "switch-row" }, [
        el("div", { class: "grow" }, [label, el("span", { class: "muted small", id: "sv-outline-desc", text: "El look clásico de sticker." })]),
        r.outlineSwitch,
      ]),
    ];
  }

  function buildSoundPanel() {
    const r = state.refs;
    const label = el("strong", { id: "sv-norm-label", text: "Volumen parejo" });
    r.normSwitch = el("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(state.normalize), "aria-labelledby": "sv-norm-label", "aria-describedby": "sv-norm-desc" });
    r.normSwitch.addEventListener("click", () => {
      state.normalize = !state.normalize;
      syncSound();
      markEdited();
      commitEdit();
    });
    return [
      el("div", { class: "switch-row" }, [
        el("div", { class: "grow" }, [label, el("span", { class: "muted small", id: "sv-norm-desc", text: "Sube el sonido bajito y evita que se escuche distorsionado." })]),
        r.normSwitch,
      ]),
    ];
  }

  function buildStep2() {
    return el("div", { class: "view", "data-step": "2" }, [buildEditBar(), buildStage(), buildTimeline(), ...buildTools()]);
  }

  function buildStep3() {
    const r = state.refs;
    // Result, shown like a sticker in a chat. While building, the same square shows the user's
    // own first frame emerging as a halftone dot grid (S12); the sticker then lands in its place.
    r.resultImg = el("img", { alt: "Tu sticker", width: "200", height: "200", decoding: "async" });
    r.sticker = el("div", { class: "sticker" }, [r.resultImg, el("span", { class: "stamp", "aria-hidden": "true" }, [icon("volume", 12)])]);
    r.halftone = el("canvas", { class: "halftone", width: "8", height: "8" });
    r.buildPct = el("span", { class: "num", text: "0 %" });
    r.progress = el("div", {
      class: "build-progress",
      role: "progressbar",
      "aria-label": "Creando tu sticker",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "0",
    }, [r.halftone, el("span", { class: "build-pill", "aria-hidden": "true" }, [r.buildPct])]);
    r.resultStage = el("div", { class: "result-stage" }, [r.progress, r.sticker]);
    // The phase is announced once per phase by onProgress; this line is visual only.
    r.buildLabel = el("p", { class: "build-phase num", "aria-hidden": "true", text: "Preparando cuadros…" });
    const buildActions = el("div", { class: "notice-actions" }, [
      el("button", { type: "button", class: "btn btn-sm", text: "Volver a editar", onclick: goBack }),
      el("button", { type: "button", class: "btn btn-sm", text: "Reintentar", onclick: startBuild }),
    ]);
    r.buildErrorBox = errorNotice("buildErrorText", buildActions);
    r.listen = el("button", { type: "button", class: "btn btn-pill btn-sm", onclick: listen });
    setListenButton(false);
    r.resultMeta = el("span", { class: "result-meta num" });
    r.resultActions = el("div", { class: "result-actions" }, [r.listen, r.resultMeta]);
    r.audio = el("audio", { preload: "auto" });
    r.audio.addEventListener("ended", () => setListenButton(false));
    r.audio.addEventListener("pause", () => setListenButton(false));
    // One fixed-height row under the square: the phase while building, the actions when ready.
    r.stageFoot = el("div", { class: "stage-foot" }, [r.buildLabel, r.resultActions]);
    r.resultBox = el("div", { class: "chatview" }, [r.resultStage, r.stageFoot, r.buildErrorBox]);

    // Chat picker.
    r.chatSearch = el("input", { type: "search", placeholder: "Buscar chat o grupo", "aria-label": "Buscar chat o grupo", autocomplete: "off", oninput: renderChats });
    r.chatList = el("ul", { class: "chats", role: "radiogroup", "aria-label": "Chats" });
    r.chatList.addEventListener("keydown", onChatKey);
    r.chatList.hidden = true;
    r.chatWaiting = el("p", { class: "picker-state" }, [el("span", { class: "spinner", "aria-hidden": "true" }), el("span", { text: "Esperando a WhatsApp Web…" })]);
    r.chatEmpty = el("p", { class: "picker-state" });
    r.chatEmpty.hidden = true;
    const refresh = el("button", { type: "button", class: "btn btn-sm", text: "Reintentar", onclick: () => (state.waReady ? loadChats() : pollWa()) });
    r.chatProblem = errorNotice("chatProblemText", refresh);
    r.picker = el("div", { class: "picker" }, [
      el("div", { class: "picker-head" }, [el("h3", { text: "Enviar a" })]),
      el("div", { class: "search" }, [icon("search", 18), r.chatSearch]),
      r.chatWaiting,
      r.chatProblem,
      r.chatEmpty,
      r.chatList,
    ]);
    const retrySend = el("button", { type: "button", class: "btn btn-sm", text: "Reintentar", onclick: send });
    r.sendErrorBox = errorNotice("sendErrorText", retrySend);
    r.sendMain = el("div", { class: "send-main" }, [r.resultBox, r.sendErrorBox, r.picker]);

    // Success.
    r.successImg = el("img", { alt: "", width: "120", height: "120" });
    r.successTitle = el("p", { class: "h-xl", tabindex: "-1" });
    r.successText = r.successTitle;
    r.success = el("div", { class: "success" }, [
      el("div", { class: "success-badge", "aria-hidden": "true" }, [icon("check", 40)]),
      r.successTitle,
      el("p", { class: "muted", text: "Ya está en el chat. Tócalo allí para escucharlo." }),
      el("div", { class: "sticker" }, [r.successImg]),
    ]);
    r.success.hidden = true;
    return el("div", { class: "view", "data-step": "3" }, [r.sendMain, r.success, r.audio]);
  }

  function buildFooter() {
    const r = state.refs;
    r.footContinue = el("button", { type: "button", class: "btn btn-primary btn-lg", text: "Continuar", onclick: () => goTo(3) });
    r.footSend = el("button", { type: "button", class: "btn btn-primary btn-lg", onclick: send });
    r.footAnother = el("button", { type: "button", class: "btn btn-primary btn-lg", text: "Crear otro", onclick: createAnother });
    r.footClose = el("button", { type: "button", class: "btn btn-secondary btn-lg", text: "Cerrar", onclick: () => hide(true) });
    r.footer = el("footer", { class: "footer" }, [r.footContinue, r.footSend, r.footClose, r.footAnother]);
    return r.footer;
  }

  // Video files can be dropped or pasted anywhere on the panel.
  function wireFileInputs(panel) {
    const r = state.refs;
    const isFileDrag = (event) => Boolean(event.dataTransfer && [...(event.dataTransfer.types || [])].includes("Files"));
    panel.addEventListener("dragenter", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      state.dragDepth++;
      r.drop.dataset.over = "true";
    });
    panel.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    });
    panel.addEventListener("dragleave", () => {
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (!state.dragDepth) r.drop.dataset.over = "false";
    });
    panel.addEventListener("drop", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      state.dragDepth = 0;
      r.drop.dataset.over = "false";
      handleFile(event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    panel.addEventListener("paste", (event) => {
      event.stopPropagation(); // keep WhatsApp's composer out of it
      const files = event.clipboardData ? [...event.clipboardData.files] : [];
      const file = files.find((item) => /^video\//.test(item.type || ""));
      if (!file) return;
      event.preventDefault();
      handleFile(file);
    });
  }

  function applyStyles(shadow) {
    const css = SV.uiStyles || "";
    try {
      const sheet = new root.CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
    } catch (_) {
      shadow.append(el("style", { text: css }));
    }
  }

  function mount() {
    if (state.host) return;
    if (!SV.uiModel) {
      SV.log("error", "ui:model-missing");
      return;
    }
    const host = el("div", { id: "stickervox-root" });
    host.hidden = true;
    const shadow = host.attachShadow({ mode: "open" });
    state.host = host;
    state.shadow = shadow;
    applyStyles(shadow);

    const r = state.refs;
    r.views = { 1: buildStep1(), 2: buildStep2(), 3: buildStep3() };
    r.body = el("div", { class: "body" }, [r.views[1], r.views[2], r.views[3]]);
    r.live = el("p", { class: "sr-only", role: "status", "aria-live": "polite" });
    const panel = el("div", { class: "panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "sv-title" }, [buildHeader(), r.body, buildFooter(), r.live]);
    state.panel = panel;
    // Keep WhatsApp Web's own keyboard shortcuts from reacting to typing inside the panel.
    for (const type of ["keydown", "keyup", "keypress"]) {
      panel.addEventListener(type, (event) => {
        if (type === "keydown") onPanelKey(event);
        event.stopPropagation();
      });
    }
    wireFileInputs(panel);
    shadow.append(panel);
    (doc.body || doc.documentElement).append(host);
    resetHistory();
    syncEditor();
    goTo(1);
    pollWa();
  }

  function show() {
    if (state.exitAnim) {
      state.exitAnim.cancel();
      state.exitAnim = null;
    } else {
      state.returnFocus = doc.activeElement;
    }
    state.host.hidden = false;
    detectTheme();
    applyFont();
    watchTheme(true);
    animateIn(state.panel, "translateY(8px)", 220);
    if (state.waReady && state.step === 3 && !state.sent) loadChats();
    if (state.step === 3) startHalftone();
    if (state.step === 2) {
      scheduleEstimate();
      root.requestAnimationFrame(measureTrack);
      state.drawKey = "";
      startLoop();
      if (state.wasPlaying) playRange();
    }
    state.refs.title.focus({ preventScroll: true });
  }

  // afterSuccess: "Cerrar" on the success screen also resets the wizard for next time.
  function hide(afterSuccess) {
    if (!state.host || state.host.hidden || state.exitAnim) return;
    const v = video();
    state.wasPlaying = Boolean(v && !v.paused && state.step === 2);
    pausePreview();
    stopLoop();
    stopHalftone();
    cancelEstimate();
    if (state.refs.audio) state.refs.audio.pause();
    watchTheme(false);
    const finish = () => {
      state.exitAnim = null;
      state.host.hidden = true;
      if (afterSuccess === true && state.sent) createAnother();
    };
    const reduce = reducedMotion();
    if (typeof state.panel.animate === "function") {
      const anim = state.panel.animate(
        reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }],
        { duration: reduce ? 100 : 150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
      );
      state.exitAnim = anim;
      anim.onfinish = () => {
        anim.cancel();
        if (state.exitAnim === anim) finish();
      };
    } else finish();
    const target = state.returnFocus;
    if (target && typeof target.focus === "function" && target !== state.host) target.focus();
  }

  function toggle() {
    if (!state.host) mount();
    if (!state.host) return;
    if (state.host.hidden || state.exitAnim) show();
    else hide();
  }

  SV.ui = { mount, toggle };
})(globalThis);
