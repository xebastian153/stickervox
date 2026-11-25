// StickerVox WhatsApp bridge (MAIN world).
// Talks to WhatsApp Web's own modules through its module loader. It never changes WhatsApp's
// feature flags: if the account cannot create sound stickers, it reports that instead.
(function (root) {
  const SV = root.StickerVox;
  const AUDIO_MIMETYPE = "audio/ogg; codecs=opus";
  const SENDABLE_SERVERS = new Set(["c.us", "g.us", "lid"]);

  function mod(name) {
    if (typeof root.require !== "function") throw new Error("WhatsApp Web todavía no ha cargado.");
    const loaded = root.require(name);
    if (!loaded) throw new Error("Falta el módulo de WhatsApp " + name + ".");
    return loaded;
  }

  function chatCollection() {
    return mod("WAWebChatCollection").ChatCollection;
  }

  function allChats(collection) {
    if (typeof collection.getModelsArray === "function") return collection.getModelsArray();
    return collection.models || [];
  }

  function serialize(id) {
    return id && typeof id._serialized === "string" ? id._serialized : String(id);
  }

  function chatName(chat) {
    return chat.formattedTitle || chat.name || chat.contact?.name || chat.contact?.pushname || chat.id?.user || "";
  }

  function isReady() {
    try {
      return typeof root.require === "function" && allChats(chatCollection()).length > 0;
    } catch {
      return false;
    }
  }

  // The user's own ids: WhatsApp keys the self chat by phone number or by LID.
  function myIds() {
    const ids = new Set();
    try {
      const me = mod("WAWebUserPrefsMeUser");
      for (const id of [me.getMaybeMePnUser?.(), me.getMaybeMeLidUser?.()]) if (id) ids.add(serialize(id));
    } catch {
      // Unknown own id: the self chat is listed like any other chat.
    }
    return ids;
  }

  function listChats() {
    const collection = chatCollection();
    const active = typeof collection.getActive === "function" ? collection.getActive() : null;
    const mine = myIds();
    const chats = [];
    for (const chat of allChats(collection)) {
      const server = chat.id?.server;
      if (!SENDABLE_SERVERS.has(server) || chat.isReadOnly === true) continue;
      const id = serialize(chat.id);
      const isSelf = mine.has(id);
      chats.push({
        id,
        name: isSelf ? "Tú (mensajes a ti)" : chatName(chat),
        isGroup: server === "g.us",
        isSelf,
        active: chat === active,
        lastActivity: Number(chat.t) || 0,
      });
    }
    chats.sort((a, b) => b.active - a.active || b.isSelf - a.isSelf || b.lastActivity - a.lastActivity);
    return chats.map(({ lastActivity, ...chat }) => chat);
  }

  function findChat(chatId) {
    const collection = chatCollection();
    const chat = collection.get?.(chatId) || allChats(collection).find((c) => serialize(c.id) === chatId);
    if (!chat) throw new Error("No encontré ese chat. Recarga la lista e inténtalo de nuevo.");
    return chat;
  }

  function readField(entry, name) {
    const getter = "get" + name[0].toUpperCase() + name.slice(1);
    if (typeof entry[getter] === "function") return entry[getter]();
    return entry[name];
  }

  // Uploads the audio as an encrypted WhatsApp media file and returns the descriptor that
  // WhatsApp expects in `stickerAudio` (see WAWebSoundStickerUtils.isCompleteStickerAudio).
  async function uploadStickerAudio(audioBlob, durationSec) {
    const Opaque = mod("WAWebMediaOpaqueData");
    const opaque = await Opaque.createFromData(audioBlob, AUDIO_MIMETYPE);
    const filehash = await mod("WAWebCryptoCalculateFilehash").calculateFilehashFromBlob(audioBlob);
    const mediaObject = mod("WAWebMediaStorage").getOrCreateMediaObject(filehash);
    mediaObject.consolidate({ mediaBlob: opaque, filehash, size: audioBlob.size });

    const Upload = mod("WAWebMediaMmsV4Upload");
    const result = await Upload.uploadMedia({
      mediaObject,
      mimetype: AUDIO_MIMETYPE,
      mediaType: "audio",
      mediaKeyInfo: mod("WAWebCryptoRandomMediaKey")(),
      uploadOrigin: mod("WAWebWamEnumUploadOriginType").UPLOAD_ORIGIN_TYPE.STICKER_WEB,
      canEnableFastForward: false,
      forwardedFromWeb: false,
      isViewOnce: false,
    });
    if (result?.kind !== Upload.UploadMediaResultKind.SUCCESS || !result.mediaEntry) {
      throw new Error("WhatsApp no aceptó la subida del audio.");
    }

    const entry = result.mediaEntry;
    const stickerAudio = {
      mediaKey: readField(entry, "mediaKey"),
      mediaKeyTimestamp: readField(entry, "mediaKeyTimestamp"),
      directPath: readField(entry, "directPath"),
      deprecatedMms3Url: readField(entry, "deprecatedMms3Url") ?? readField(entry, "url") ?? null,
      filehash,
      encFilehash: readField(entry, "encFilehash"),
      size: audioBlob.size,
      mimetype: AUDIO_MIMETYPE,
      duration: Math.max(1, Math.round(durationSec)),
    };
    if (!mod("WAWebSoundStickerUtils").isCompleteStickerAudio(stickerAudio)) {
      SV.log("error", "wa:incomplete-sticker-audio", Object.keys(stickerAudio).filter((k) => stickerAudio[k] == null));
      throw new Error("El audio se subió, pero WhatsApp no lo reconoce como audio de sticker.");
    }
    return stickerAudio;
  }

  async function sendSoundSticker({ chatId, webp, audio, durationSec }) {
    try {
      // WhatsApp's own send path only requires the consumption gate
      // (WAWebSoundStickerUtils.getSendableStickerAudio); the creation gate guards its
      // sticker-maker UI, which StickerVox replaces. Nothing is forced either way.
      if (!mod("WAWebSoundStickerGating").isSoundStickerConsumptionEnabled()) {
        return { ok: false, error: "Tu cuenta de WhatsApp todavía no admite stickers con sonido." };
      }
      const chat = findChat(chatId);
      const stickerAudio = await uploadStickerAudio(audio, durationSec);

      const mediaBlob = await mod("WAWebMediaOpaqueData").createFromData(webp, "image/webp");
      const MediaPrep = mod("WAWebMediaPrep").default || mod("WAWebMediaPrep");
      const prep = new MediaPrep(
        "sticker",
        Promise.resolve({
          type: "sticker",
          mediaBlob,
          mimetype: "image/webp",
          size: webp.size,
          fullWidth: SV.media?.LIMITS?.size || 512,
          fullHeight: SV.media?.LIMITS?.size || 512,
          isAnimated: true,
        })
      );
      const result = await prep.sendToChat({ chat, options: { stickerAudio } });
      const OK = mod("WAWebSendMsgResultAction").SendMsgResult.OK;
      if (result?.messageSendResult !== OK) {
        SV.log("error", "wa:send-failed", result?.messageSendResult);
        return { ok: false, error: "WhatsApp no pudo enviar el sticker (" + String(result?.messageSendResult) + ")." };
      }
      return { ok: true };
    } catch (error) {
      SV.log("error", "wa:send-error", error);
      return { ok: false, error: error?.message || String(error) };
    }
  }

  SV.wa = { isReady, listChats, sendSoundSticker, uploadStickerAudio };
})(globalThis);
