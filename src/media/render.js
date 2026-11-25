// StickerVox media: video loading and frame rendering (crop + shape + text/emoji layers).
// drawFrame is shared by the UI preview and the sticker builder, so preview == output.
(function (root) {
  const SV = root.StickerVox;
  const media = (SV.media = SV.media || {});

  const FONT_FAMILY = 'Impact, "Arial Black", sans-serif';
  const ROUND_FAMILY = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const EMOJI_FAMILY = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const FONT_RATIO = 0.125; // legacy caption font size relative to the output size
  const MAX_WIDTH_RATIO = 0.92;
  const MARGIN_RATIO = 0.055;
  const OUTLINE_RATIO = 0.02;
  const LINE_GAP = 1.1;
  const MIN_FONT = 8;
  const ROUND_RATIO = 0.2; // "rounded" corner radius relative to the output size
  const SHAPE_BORDER_RATIO = 0.035; // white sticker border width relative to the output size
  const PLACEHOLDER = "Tu texto";
  const SHAPES = ["square", "rounded", "circle"];
  const DARK_INK = "#111b21";
  const LIGHT_INK = "#ffffff";

  // Per style: font, and the padding around the text box (relative to the font size).
  const TEXT_STYLES = {
    meme: { weight: "bold", family: FONT_FAMILY, padX: 0, padY: 0 },
    bubble: { weight: "800", family: ROUND_FAMILY, padX: 0.5, padY: 0.3, box: true },
    label: { weight: "800", family: ROUND_FAMILY, padX: 0.4, padY: 0.22, box: true },
    shadow: { weight: "800", family: ROUND_FAMILY, padX: 0.15, padY: 0.15 },
  };

  function loadVideo(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.muted = false;
      video.playsInline = true;
      video.preload = "auto";
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
      };
      const onMeta = () => {
        cleanup();
        resolve({ video, url, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      };
      const onError = () => {
        cleanup();
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo abrir el video. Prueba con un MP4 o WebM."));
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError);
      video.src = url;
    });
  }

  // Pure: cues visible at tRel (seconds from clip start), start inclusive, end exclusive.
  function activeCaptions(captions, tRel) {
    if (!Array.isArray(captions)) return [];
    return captions.filter((c) => c && c.start <= tRel && tRel < c.end);
  }

  // ---------- pure helpers (exported for tests and for the panel's selection box) ----------

  // Readable ink on a fill color: dark on light colors, white on dark ones. Invalid -> white fill.
  function inkFor(color) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(color || ""));
    if (!m) return DARK_INK;
    const n = parseInt(m[1], 16);
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    // Pick the ink with the higher WCAG contrast ratio against the fill.
    return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? DARK_INK : LIGHT_INK;
  }

  const normalizeShape = (shape) => (SHAPES.includes(shape) ? shape : "square");

  // Outline of the sticker shape inset by `inset` px. Rounded corners follow the nested-radius rule.
  function shapeGeometry(shape, size, inset) {
    const s = normalizeShape(shape);
    const i = Number.isFinite(inset) ? inset : 0;
    if (s === "circle") return { kind: "circle", cx: size / 2, cy: size / 2, r: Math.max(0, size / 2 - i) };
    const r = s === "rounded" ? Math.max(0, size * ROUND_RATIO - i) : 0;
    return { kind: "rect", x: i, y: i, w: size - 2 * i, h: size - 2 * i, r };
  }

  // Box of a text or emoji layer in output pixels; measure(text, font) -> width.
  function layoutText(measure, layer, size) {
    const emoji = layer.type === "emoji";
    const style = emoji ? null : TEXT_STYLES[layer.style] || TEXT_STYLES.meme;
    const cx = layer.x * size;
    const cy = layer.y * size;
    let fontSize = Math.max(MIN_FONT, Math.round(layer.scale * size));
    const lines = String(layer.text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (emoji) {
      const font = fontSize + "px " + EMOJI_FAMILY;
      const glyph = lines.join(" ");
      const w = Math.max(glyph ? measure(glyph, font) : 0, fontSize) * 1.05;
      return { fontSize, font, lines: glyph ? [glyph] : [], lineHeight: fontSize, padX: 0, padY: 0, w, h: fontSize * 1.15, cx, cy, outline: 0 };
    }

    const fontFor = (px) => style.weight + " " + px + "px " + style.family;
    const outlineFor = (px) => (layer.style === "meme" || !TEXT_STYLES[layer.style] ? Math.min(OUTLINE_RATIO * 2 * size, 0.32 * px) : 0);
    const shown = lines.length ? lines : [PLACEHOLDER];
    const measureAt = (px) => {
      const font = fontFor(px);
      const outline = outlineFor(px);
      const padX = style.padX * px + outline / 2;
      const padY = style.padY * px + outline / 2;
      const widest = Math.max(...shown.map((line) => measure(line, font)));
      return { font, outline, padX, padY, w: widest + 2 * padX };
    };
    const maxW = size * MAX_WIDTH_RATIO;
    let box = measureAt(fontSize);
    for (let i = 0; i < 4 && box.w > maxW && fontSize > MIN_FONT; i++) {
      fontSize = Math.max(MIN_FONT, Math.floor((fontSize * maxW) / box.w));
      box = measureAt(fontSize);
    }
    const lineHeight = fontSize * LINE_GAP;
    const h = shown.length * lineHeight + 2 * box.padY;
    return { fontSize, font: box.font, lines, lineHeight, padX: box.padX, padY: box.padY, w: box.w, h, cx, cy, outline: box.outline };
  }

  // Normalized box {x, y, w, h} (center + size, 0..1) of a layer, measured with a real context.
  function layerBox(ctx, layer, size) {
    ctx.save();
    const box = layoutText((text, font) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    }, layer, size);
    ctx.restore();
    return { x: box.cx / size, y: box.cy / size, w: box.w / size, h: box.h / size };
  }

  // ---------- drawing ----------

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (rr <= 0) {
      ctx.rect(x, y, w, h);
    } else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
    }
    ctx.closePath();
  }
  function tracePath(ctx, geo) {
    if (geo.kind === "circle") {
      ctx.beginPath();
      ctx.arc(geo.cx, geo.cy, geo.r, 0, Math.PI * 2);
      ctx.closePath();
    } else roundRectPath(ctx, geo.x, geo.y, geo.w, geo.h, geo.r);
  }

  function fitFontSize(ctx, lines, size) {
    let fontSize = Math.round(size * FONT_RATIO);
    ctx.font = "bold " + fontSize + "px " + FONT_FAMILY;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const maxWidth = size * MAX_WIDTH_RATIO;
    if (widest > maxWidth) fontSize = Math.max(8, Math.floor((fontSize * maxWidth) / widest));
    return fontSize;
  }

  // Legacy Caption {text, start, end, position} blocks: unchanged layout from v1.
  function drawCaptionBlock(ctx, lines, position, size) {
    const fontSize = fitFontSize(ctx, lines, size);
    ctx.font = "bold " + fontSize + "px " + FONT_FAMILY;
    ctx.lineWidth = 2 * OUTLINE_RATIO * size * Math.min(1, fontSize / (size * FONT_RATIO));
    const lineHeight = fontSize * LINE_GAP;
    const margin = size * MARGIN_RATIO;
    const top = position === "top";
    ctx.textBaseline = top ? "top" : "bottom";
    // Bottom blocks grow upwards from the bottom margin; top blocks grow downwards.
    const ordered = top ? lines : lines.slice().reverse();
    ordered.forEach((line, i) => {
      const y = top ? margin + i * lineHeight : size - margin - i * lineHeight;
      ctx.strokeText(line, size / 2, y);
      ctx.fillText(line, size / 2, y);
    });
  }
  function drawCaptions(ctx, captions, size) {
    if (!captions.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    for (const position of ["bottom", "top"]) {
      const lines = captions
        .filter((c) => (c.position === "top" ? "top" : "bottom") === position)
        .flatMap((c) => String(c.text).split("\n").map((l) => l.trim()).filter(Boolean));
      if (lines.length) drawCaptionBlock(ctx, lines, position, size);
    }
    ctx.restore();
  }

  function drawLayer(ctx, layer, size) {
    const box = layoutText((text, font) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    }, layer, size);
    if (!box.lines.length) return;
    ctx.save();
    const color = layer.color || LIGHT_INK;
    const ink = inkFor(color);
    const style = layer.type === "emoji" ? "emoji" : TEXT_STYLES[layer.style] ? layer.style : "meme";
    if (style === "bubble" || style === "label") {
      ctx.fillStyle = color;
      roundRectPath(ctx, box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, style === "bubble" ? Math.min(box.h / 2, box.fontSize * 0.8) : box.fontSize * 0.28);
      ctx.fill();
    }
    ctx.font = box.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.fillStyle = style === "bubble" || style === "label" ? ink : color;
    if (style === "meme") {
      ctx.strokeStyle = ink === LIGHT_INK ? LIGHT_INK : "#000000";
      ctx.lineWidth = box.outline;
    } else if (style === "shadow") {
      ctx.shadowColor = ink === LIGHT_INK ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = box.fontSize * 0.3;
      ctx.shadowOffsetY = box.fontSize * 0.08;
    }
    const first = box.cy - ((box.lines.length - 1) * box.lineHeight) / 2;
    box.lines.forEach((line, i) => {
      const y = first + i * box.lineHeight;
      if (style === "meme" && box.outline > 0) ctx.strokeText(line, box.cx, y);
      ctx.fillText(line, box.cx, y);
    });
    ctx.restore();
  }

  // Draws crop {x, y, size} of source (video pixels) into the sticker shape, then the items
  // visible at tRel: legacy captions (no `type`) and text/emoji layers, in array (z) order.
  // options = { shape: "square" | "rounded" | "circle", outline: boolean }. Outside the shape
  // stays transparent; the default square without outline is opaque, as in v1.
  function drawFrame(ctx, source, crop, items, tRel, size, options) {
    const shape = normalizeShape(options && options.shape);
    const outline = Boolean(options && options.outline);
    ctx.save();
    if (shape === "square" && !outline) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      if (source && crop) ctx.drawImage(source, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size);
    } else {
      ctx.clearRect(0, 0, size, size);
      const border = outline ? size * SHAPE_BORDER_RATIO : 0;
      if (outline) {
        tracePath(ctx, shapeGeometry(shape, size, 0));
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.save();
      tracePath(ctx, shapeGeometry(shape, size, border));
      ctx.clip();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      if (source && crop) ctx.drawImage(source, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size);
      ctx.restore();
      // Layers may cover the border but never leave the shape.
      tracePath(ctx, shapeGeometry(shape, size, 0));
      ctx.clip();
    }

    const visible = activeCaptions(items, tRel).filter((c) => String(c.text || "").trim());
    drawCaptions(ctx, visible.filter((c) => !c.type), size);
    for (const layer of visible) if (layer.type) drawLayer(ctx, layer, size);
    ctx.restore();
  }

  media.loadVideo = loadVideo;
  media.activeCaptions = activeCaptions;
  media.drawFrame = drawFrame;
  media.inkFor = inkFor;
  media.shapeGeometry = shapeGeometry;
  media.layoutText = layoutText;
  media.layerBox = layerBox;
  media.ROUND_RATIO = ROUND_RATIO;
  media.SHAPE_BORDER_RATIO = SHAPE_BORDER_RATIO;
  media.SHAPES = SHAPES;
})(globalThis);
