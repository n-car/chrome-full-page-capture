const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const BASE64_CHUNK_SIZE = 512 * 1024;
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;

let creatingOffscreenDocument;

export class DownloadError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "DownloadError";
    this.code = "DOWNLOAD_FAILED";
  }
}

export async function downloadPng(api, base64Data, filename) {
  if (typeof base64Data !== "string" || base64Data.length === 0) {
    throw new DownloadError("Chrome could not download an empty screenshot.");
  }

  const token = createToken();
  let blobUrl;
  let offscreenReady = false;

  try {
    await ensureOffscreenDocument(api);
    offscreenReady = true;
    blobUrl = await createPngBlobUrl(api, token, base64Data);
    const downloadId = await api.downloads.download({
      url: blobUrl,
      filename,
      conflictAction: "uniquify",
      saveAs: false
    });

    if (!Number.isInteger(downloadId)) {
      throw new Error("Chrome did not return a download id.");
    }

    await waitForDownload(api, downloadId);
    return downloadId;
  } catch (error) {
    if (error instanceof DownloadError) {
      throw error;
    }
    throw new DownloadError(
      "The screenshot was captured, but Chrome could not complete the PNG download.",
      error
    );
  } finally {
    if (offscreenReady) {
      if (blobUrl) {
        await sendToOffscreen(api, { type: "revoke-url", token }).catch(() => undefined);
      } else {
        await sendToOffscreen(api, { type: "discard-upload", token }).catch(() => undefined);
      }
      await api.offscreen.closeDocument().catch(() => undefined);
    }
  }
}

async function ensureOffscreenDocument(api) {
  const documentUrl = api.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await api.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = api.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["BLOBS"],
        justification: "Create a local Blob URL for a captured PNG download."
      })
      .finally(() => {
        creatingOffscreenDocument = undefined;
      });
  }

  await creatingOffscreenDocument;
}

async function createPngBlobUrl(api, token, base64Data) {
  const totalChunks = Math.ceil(base64Data.length / BASE64_CHUNK_SIZE);
  await sendToOffscreen(api, {
    type: "begin-upload",
    token,
    totalChunks,
    mimeType: "image/png"
  });

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * BASE64_CHUNK_SIZE;
    await sendToOffscreen(api, {
      type: "upload-chunk",
      token,
      index,
      data: base64Data.slice(start, start + BASE64_CHUNK_SIZE)
    });
  }

  const response = await sendToOffscreen(api, { type: "finish-upload", token });
  if (typeof response.blobUrl !== "string" || !response.blobUrl.startsWith("blob:")) {
    throw new Error("The offscreen document returned an invalid Blob URL.");
  }
  return response.blobUrl;
}

async function sendToOffscreen(api, message) {
  const response = await api.runtime.sendMessage({
    target: "offscreen",
    ...message
  });
  if (!response?.ok) {
    throw new Error(response?.error || "The offscreen document did not respond.");
  }
  return response;
}

async function waitForDownload(api, downloadId) {
  let timeoutId;
  let listener;

  const terminalState = new Promise((resolve, reject) => {
    listener = (delta) => {
      if (delta.id !== downloadId) {
        return;
      }
      if (delta.state?.current === "complete") {
        resolve();
      } else if (delta.state?.current === "interrupted") {
        reject(new Error(`Download interrupted${delta.error?.current ? `: ${delta.error.current}` : "."}`));
      }
    };
    api.downloads.onChanged.addListener(listener);

    timeoutId = globalThis.setTimeout(() => {
      reject(new Error("Download did not finish within three minutes."));
    }, DOWNLOAD_TIMEOUT_MS);
  });
  void terminalState.catch(() => undefined);

  try {
    const [item] = await api.downloads.search({ id: downloadId });
    if (item?.state === "complete") {
      return;
    }
    if (item?.state === "interrupted") {
      throw new Error(`Download interrupted${item.error ? `: ${item.error}` : "."}`);
    }
    await terminalState;
  } finally {
    globalThis.clearTimeout(timeoutId);
    if (listener) {
      api.downloads.onChanged.removeListener(listener);
    }
  }
}

function createToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
