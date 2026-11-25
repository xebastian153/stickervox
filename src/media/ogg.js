// StickerVox media: Ogg Opus muxer (RFC 3533 pages, RFC 7845 Opus mapping) and WebCodecs encoder.
(function (root) {
  const SV = root.StickerVox;
  const media = (SV.media = SV.media || {});

  const SERIAL = 0x53567831; // fixed stream serial ("SVx1")
  const FLAG_BOS = 0x02;
  const FLAG_EOS = 0x04;
  const MAX_SEGMENTS = 255;
  const TARGET_PAGE_SAMPLES = 48000; // flush an audio page about once per second
  const DEFAULT_PRE_SKIP = 312;
  const VENDOR = "StickerVox";

  // Ogg CRC-32: polynomial 0x04C11DB7, MSB-first, initial value 0, no final xor.
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      table[i] = r >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0;
    for (let i = 0; i < bytes.length; i++) {
      crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 255]) >>> 0;
    }
    return crc;
  }

  function lacingFor(length) {
    const values = [];
    let rest = length;
    while (rest >= 255) {
      values.push(255);
      rest -= 255;
    }
    values.push(rest); // a trailing value < 255 terminates the packet (0 when length % 255 === 0)
    return values;
  }

  function buildPage(packets, { flags, granule, sequence }) {
    const lacing = [];
    let bodyLen = 0;
    for (const p of packets) {
      lacing.push(...lacingFor(p.length));
      bodyLen += p.length;
    }
    const page = new Uint8Array(27 + lacing.length + bodyLen);
    const view = new DataView(page.buffer);
    page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
    page[4] = 0; // stream structure version
    page[5] = flags;
    view.setUint32(6, granule % 0x100000000, true);
    view.setUint32(10, Math.floor(granule / 0x100000000), true);
    view.setUint32(14, SERIAL, true);
    view.setUint32(18, sequence, true);
    page[26] = lacing.length;
    page.set(lacing, 27);
    let o = 27 + lacing.length;
    for (const p of packets) {
      page.set(p, o);
      o += p.length;
    }
    view.setUint32(22, crc32(page), true); // CRC field is still zero here
    return page;
  }

  function opusHead(channels, preSkip, inputSampleRate) {
    const head = new Uint8Array(19);
    const view = new DataView(head.buffer);
    head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
    head[8] = 1; // version
    head[9] = channels;
    view.setUint16(10, preSkip, true);
    view.setUint32(12, inputSampleRate, true);
    view.setInt16(16, 0, true); // output gain
    head[18] = 0; // channel mapping family 0 (mono/stereo)
    return head;
  }

  function opusTags() {
    const tags = new Uint8Array(8 + 4 + VENDOR.length + 4);
    const view = new DataView(tags.buffer);
    tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
    view.setUint32(8, VENDOR.length, true);
    for (let i = 0; i < VENDOR.length; i++) tags[12 + i] = VENDOR.charCodeAt(i);
    view.setUint32(12 + VENDOR.length, 0, true); // user comment list length
    return tags;
  }

  // packets: [{ data: Uint8Array, samples48k }]. Optional inputLength48k trims the end of the
  // stream: the last granule becomes preSkip + inputLength48k (RFC 7845 end trimming).
  function muxOggOpus(packets, options) {
    const { channels, preSkip = DEFAULT_PRE_SKIP, inputSampleRate = 48000, inputLength48k } = options || {};
    if (!packets || packets.length === 0) throw new Error("muxOggOpus needs at least one packet");
    if (channels !== 1 && channels !== 2) throw new Error("muxOggOpus supports mono or stereo only");

    const pages = [];
    let sequence = 0;
    pages.push(buildPage([opusHead(channels, preSkip, inputSampleRate)], { flags: FLAG_BOS, granule: 0, sequence: sequence++ }));
    pages.push(buildPage([opusTags()], { flags: 0, granule: 0, sequence: sequence++ }));

    const totalSamples = packets.reduce((sum, p) => sum + p.samples48k, 0);
    const finalGranule =
      typeof inputLength48k === "number" ? Math.min(totalSamples, preSkip + inputLength48k) : totalSamples;

    let granule = 0;
    let pending = [];
    let pendingSegments = 0;
    let pendingSamples = 0;
    const flush = (isLast) => {
      pages.push(
        buildPage(pending, {
          flags: isLast ? FLAG_EOS : 0,
          granule: isLast ? finalGranule : granule,
          sequence: sequence++,
        }),
      );
      pending = [];
      pendingSegments = 0;
      pendingSamples = 0;
    };

    for (const packet of packets) {
      const segments = lacingFor(packet.data.length).length;
      if (segments > MAX_SEGMENTS) throw new Error("Opus packet too large for one Ogg page");
      if (pending.length && (pendingSegments + segments > MAX_SEGMENTS || pendingSamples >= TARGET_PAGE_SAMPLES)) {
        flush(false);
      }
      pending.push(packet.data);
      pendingSegments += segments;
      pendingSamples += packet.samples48k;
      granule += packet.samples48k;
    }
    flush(true);

    let total = 0;
    for (const p of pages) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of pages) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  async function resampleTo48k(channels, sampleRate) {
    if (sampleRate === 48000) return channels;
    const length = Math.max(1, Math.round((channels[0].length * 48000) / sampleRate));
    const ctx = new OfflineAudioContext(channels.length, length, 48000);
    const buffer = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
    channels.forEach((ch, i) => buffer.copyToChannel(ch, i));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    const rendered = await ctx.startRendering();
    return Array.from({ length: channels.length }, (_, i) => rendered.getChannelData(i));
  }

  function preSkipFrom(description) {
    if (!description) return DEFAULT_PRE_SKIP;
    const bytes = description instanceof ArrayBuffer ? new Uint8Array(description) : new Uint8Array(description.buffer, description.byteOffset, description.byteLength);
    const isHead = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 8)) === "OpusHead";
    return isHead ? bytes[10] | (bytes[11] << 8) : DEFAULT_PRE_SKIP;
  }

  // Encodes PCM (Float32Array per channel) to a genuine Ogg Opus Blob with WebCodecs.
  async function encodeOggOpus({ channels, sampleRate }) {
    if (typeof root.AudioEncoder !== "function") {
      throw new Error("Este navegador no soporta la codificación de audio Opus (WebCodecs).");
    }
    const input = channels.slice(0, 2);
    const pcm = await resampleTo48k(input, sampleRate);
    const numberOfChannels = pcm.length;
    const frames = pcm[0].length;

    const packets = [];
    let preSkip = DEFAULT_PRE_SKIP;
    let failure = null;
    const encoder = new AudioEncoder({
      output(chunk, metadata) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const samples48k = chunk.duration ? Math.round((chunk.duration * 48000) / 1e6) : 960;
        packets.push({ data, samples48k });
        if (metadata && metadata.decoderConfig) preSkip = preSkipFrom(metadata.decoderConfig.description);
      },
      error(e) {
        failure = e;
      },
    });
    encoder.configure({ codec: "opus", sampleRate: 48000, numberOfChannels, bitrate: 64000 });

    const block = 4800; // 100 ms per AudioData
    for (let start = 0; start < frames; start += block) {
      const n = Math.min(block, frames - start);
      const planar = new Float32Array(n * numberOfChannels);
      for (let c = 0; c < numberOfChannels; c++) planar.set(pcm[c].subarray(start, start + n), c * n);
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: 48000,
        numberOfFrames: n,
        numberOfChannels,
        timestamp: Math.round((start * 1e6) / 48000),
        data: planar,
      });
      encoder.encode(data);
      data.close();
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw new Error("Falló la codificación del audio: " + (failure.message || failure));
    if (packets.length === 0) throw new Error("El audio quedó vacío tras la codificación.");

    const bytes = muxOggOpus(packets, {
      channels: numberOfChannels,
      preSkip,
      inputSampleRate: sampleRate,
      inputLength48k: frames,
    });
    return new Blob([bytes], { type: "audio/ogg; codecs=opus" });
  }

  media.muxOggOpus = muxOggOpus;
  media.encodeOggOpus = encodeOggOpus;
})(globalThis);
