import {
  executeCaptureRequest,
  normalizeCaptureRequest,
  toUserMessage
} from "./capture.js";

const CONTROL_PORT = "capture-control";
const ports = new Set();

let captureState = {
  busy: false,
  status: "Ready",
  tone: "neutral"
};
let badgeGeneration = 0;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== CONTROL_PORT) {
    return;
  }

  ports.add(port);
  sendState(port);

  port.onMessage.addListener((message) => {
    if (message?.type === "get-state") {
      sendState(port);
      return;
    }

    if (message?.type === "capture") {
      void startCapture(message.request);
    }
  });

  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "capture-full-page") {
    return;
  }

  void startCapture(
    {
      mode: "full-page",
      options: {
        hideScrollbars: true,
        disableAnimations: true
      }
    },
    tab
  );
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "service-worker" || message?.type !== "offscreen-heartbeat") {
    return false;
  }
  sendResponse({ ok: true });
  return false;
});

async function startCapture(rawRequest, commandTab) {
  if (captureState.busy) {
    publishState({
      ...captureState,
      status: "A capture is already running."
    });
    return;
  }

  let request;
  try {
    request = normalizeCaptureRequest(rawRequest);
  } catch (error) {
    publishState({
      busy: false,
      status: `Error: ${toUserMessage(error)}`,
      tone: "error"
    });
    return;
  }

  publishState({ busy: true, status: "Preparing page…", tone: "working" });
  await setWorkingBadge();

  try {
    const tab = commandTab?.id ? commandTab : await getActiveTab();
    const results = await executeCaptureRequest({
      api: chrome,
      tab,
      request,
      onProgress(status) {
        publishState({ busy: true, status, tone: "working" });
      }
    });

    const fileCount = results.length;
    publishState({
      busy: false,
      status: fileCount === 1 ? "Done — PNG downloaded" : `Done — ${fileCount} PNG files downloaded`,
      tone: "success"
    });
    await setFinishedBadge("OK", "#15803d", 3000);
  } catch (error) {
    const message = toUserMessage(error);
    publishState({ busy: false, status: `Error: ${message}`, tone: "error" });
    await setFinishedBadge("ERR", "#b91c1c", 5000, message);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("The active tab is no longer available.");
  }
  return tab;
}

function publishState(nextState) {
  captureState = nextState;
  for (const port of ports) {
    sendState(port);
  }
}

function sendState(port) {
  try {
    port.postMessage({ type: "state", state: captureState });
  } catch {
    ports.delete(port);
  }
}

async function setWorkingBadge() {
  badgeGeneration += 1;
  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ color: "#0369a1" }),
    chrome.action.setBadgeText({ text: "…" }),
    chrome.action.setTitle({ title: "Full Page Capture — capture in progress" })
  ]);
}

async function setFinishedBadge(text, color, clearAfterMs, detail = "") {
  const generation = ++badgeGeneration;
  const title = detail
    ? `Full Page Capture — ${detail}`
    : "Full Page Capture — capture complete";

  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setBadgeText({ text }),
    chrome.action.setTitle({ title })
  ]);

  globalThis.setTimeout(() => {
    if (generation !== badgeGeneration || captureState.busy) {
      return;
    }
    void Promise.allSettled([
      chrome.action.setBadgeText({ text: "" }),
      chrome.action.setTitle({ title: "Capture this page" })
    ]);
  }, clearAfterMs);
}
