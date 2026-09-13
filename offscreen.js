(() => {
  "use strict";

  const uploads = new Map();
  const blobUrls = new Map();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "offscreen") {
      return false;
    }

    void handleMessage(message).then(
      (result) => sendResponse({ ok: true, ...result }),
      (error) => sendResponse({
        ok: false,
        error: String(error?.message || error || "Offscreen operation failed.").slice(0, 300)
      })
    );
    return true;
  });

  globalThis.setInterval(() => {
    if (uploads.size === 0 && blobUrls.size === 0) {
      return;
    }
    void chrome.runtime
      .sendMessage({ target: "service-worker", type: "offscreen-heartbeat" })
      .catch(() => undefined);
  }, 15_000);

  async function handleMessage(message) {
    switch (message.type) {
      case "begin-upload":
        beginUpload(message);
        return {};
      case "upload-chunk":
        addChunk(message);
        return {};
      case "finish-upload":
        return finishUpload(message);
      case "discard-upload":
        uploads.delete(message.token);
        return {};
      case "revoke-url":
        revokeUrl(message.token);
        return {};
      default:
        throw new Error("Unknown offscreen message.");
    }
  }

  function beginUpload({ token, totalChunks, mimeType }) {
    if (typeof token !== "string" || !Number.isInteger(totalChunks) || totalChunks < 1) {
      throw new Error("Invalid Blob upload metadata.");
    }
    uploads.set(token, {
      chunks: new Array(totalChunks).fill(null),
      mimeType: mimeType || "application/octet-stream"
    });
  }

  function addChunk({ token, index, data }) {
    const upload = uploads.get(token);
    if (!upload || !Number.isInteger(index) || index < 0 || index >= upload.chunks.length) {
      throw new Error("Invalid Blob upload chunk.");
    }
    if (typeof data !== "string") {
      throw new Error("Blob upload data must be base64 text.");
    }
    upload.chunks[index] = decodeBase64Chunk(data);
  }

  function finishUpload({ token }) {
    const upload = uploads.get(token);
    if (!upload || upload.chunks.some((chunk) => !(chunk instanceof Uint8Array))) {
      throw new Error("Blob upload is incomplete.");
    }

    const blobUrl = URL.createObjectURL(new Blob(upload.chunks, { type: upload.mimeType }));
    uploads.delete(token);
    blobUrls.set(token, blobUrl);
    return { blobUrl };
  }

  function decodeBase64Chunk(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function revokeUrl(token) {
    const blobUrl = blobUrls.get(token);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrls.delete(token);
    }
    uploads.delete(token);
  }
})();
