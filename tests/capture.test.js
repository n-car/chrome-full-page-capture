import test from "node:test";
import assert from "node:assert/strict";

import {
  CaptureError,
  assertCapturableTab,
  buildFilename,
  createCapturePlan,
  executeCaptureRequest,
  normalizeCaptureRequest,
  sanitizeFilenamePart,
  toUserMessage
} from "../capture.js";

const FIXED_DATE = new Date(2026, 8, 13, 14, 25, 30);

test("buildFilename creates a readable, filesystem-safe name", () => {
  assert.equal(
    buildFilename("https://www.example.com/Casi%20Reali/Über/?draft=1", "1440", FIXED_DATE),
    "www.example.com_casi-reali-uber_1440_20260913-142530.png"
  );
  assert.equal(
    buildFilename("https://example.com/", "full-1365", FIXED_DATE),
    "example.com_home_full-1365_20260913-142530.png"
  );
  assert.equal(sanitizeFilenamePart("  a<>:\"/\\|?* b  "), "a-b");
});

test("capture requests are normalized and custom widths are bounded", () => {
  assert.deepEqual(normalizeCaptureRequest({ mode: "viewport" }), {
    mode: "viewport",
    options: { hideScrollbars: true, disableAnimations: true }
  });
  assert.equal(normalizeCaptureRequest({ mode: "responsive", width: 390 }).mobile, true);
  assert.equal(normalizeCaptureRequest({ mode: "responsive", width: 1024 }).mobile, false);
  assert.throws(
    () => normalizeCaptureRequest({ mode: "responsive", width: 319 }),
    (error) => error instanceof CaptureError && error.code === "INVALID_WIDTH"
  );
});

test("responsive set uses the required order and mobile viewport heights", () => {
  const plan = createCapturePlan({ mode: "set", options: {} });
  assert.deepEqual(
    plan.map(({ width, height, mobile }) => ({ width, height, mobile })),
    [
      { width: 1440, height: 900, mobile: false },
      { width: 1280, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true },
      { width: 430, height: 932, mobile: true }
    ]
  );
});

test("restricted and unsupported tabs fail before debugger attachment", () => {
  assert.throws(
    () => assertCapturableTab({ id: 1, url: "chrome://settings" }),
    (error) => error.code === "UNSUPPORTED_PAGE"
  );
  assert.throws(
    () => assertCapturableTab({ id: 1, url: "https://chromewebstore.google.com/detail/example" }),
    (error) => error.code === "RESTRICTED_PAGE"
  );
});

test("a mobile capture applies real emulation and always restores it before download", async () => {
  const { api, calls } = createChromeMock({ documentUrl: "https://example.com/review" });
  const states = [];

  const [result] = await executeCaptureRequest({
    api,
    tab: { id: 7, url: "https://example.com/review" },
    request: { mode: "responsive", width: 390, options: {} },
    onProgress: (status) => states.push(status),
    now: () => FIXED_DATE
  });

  assert.equal(result.filename, "example.com_review_390_20260913-142530.png");
  assert.equal(result.downloadId, 41);
  assert.ok(states.some((state) => state.includes("Applying responsive viewport")));
  assert.ok(states.some((state) => state.includes("Downloading")));

  const methodCalls = calls.filter((call) => call.kind === "command");
  const metrics = methodCalls.find((call) => call.method === "Emulation.setDeviceMetricsOverride");
  assert.deepEqual(metrics.params, {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  assert.ok(methodCalls.some((call) => call.method === "Emulation.clearDeviceMetricsOverride"));
  assert.deepEqual(
    methodCalls
      .filter((call) => call.method === "Emulation.setTouchEmulationEnabled")
      .map((call) => call.params.enabled),
    [true, false]
  );

  const capture = methodCalls.find((call) => call.method === "Page.captureScreenshot");
  assert.equal(capture.params.captureBeyondViewport, true);
  assert.equal("clip" in capture.params, false);
  assert.ok(calls.some((call) => call.kind === "insertCSS"));
  assert.ok(calls.some((call) => call.kind === "removeCSS"));

  const detachIndex = calls.findIndex((call) => call.kind === "detach");
  const downloadIndex = calls.findIndex((call) => call.kind === "download");
  assert.ok(detachIndex >= 0 && detachIndex < downloadIndex, "debugger must detach before download");

  const insertCssIndex = calls.findIndex((call) => call.kind === "insertCSS");
  const applyMetricsIndex = calls.findIndex(
    (call) => call.kind === "command" && call.method === "Emulation.setDeviceMetricsOverride"
  );
  const clearMetricsIndex = calls.findIndex(
    (call) => call.kind === "command" && call.method === "Emulation.clearDeviceMetricsOverride"
  );
  const restoreScrollIndex = calls.findIndex(
    (call) => call.kind === "executeScript" && call.details.func?.name === "restoreDocumentScroll"
  );
  const removeCssIndex = calls.findIndex((call) => call.kind === "removeCSS");
  assert.ok(insertCssIndex < applyMetricsIndex, "animations must be disabled before responsive resize");
  assert.ok(clearMetricsIndex < restoreScrollIndex, "original viewport must be restored before scroll");
  assert.ok(restoreScrollIndex < removeCssIndex, "scroll must be restored while smooth scrolling is disabled");
  assert.ok(removeCssIndex < detachIndex, "temporary CSS must be removed before detach");
});

test("capture failure still removes CSS, clears emulation, and detaches", async () => {
  const { api, calls } = createChromeMock({
    failCapture: true,
    documentUrl: "https://example.com/long"
  });

  await assert.rejects(
    executeCaptureRequest({
      api,
      tab: { id: 8, url: "https://example.com/long" },
      request: { mode: "responsive", width: 430, options: {} }
    }),
    (error) => error instanceof CaptureError && error.code === "CAPTURE_FAILED"
  );

  assert.ok(calls.some((call) => call.kind === "removeCSS"));
  assert.ok(
    calls.some(
      (call) =>
        call.kind === "command" && call.method === "Emulation.clearDeviceMetricsOverride"
    )
  );
  assert.ok(calls.some((call) => call.kind === "detach"));
  assert.equal(calls.some((call) => call.kind === "download"), false);
});

test("a cleanup failure is reported even when capture already failed", async () => {
  const { api, calls } = createChromeMock({
    failCapture: true,
    failCssRemoval: true,
    documentUrl: "https://example.com/cleanup"
  });

  await assert.rejects(
    executeCaptureRequest({
      api,
      tab: { id: 12, url: "https://example.com/cleanup" },
      request: { mode: "responsive", width: 1280, options: {} }
    }),
    (error) =>
      error instanceof CaptureError &&
      error.code === "CAPTURE_AND_CLEANUP_FAILED" &&
      /reload the tab/i.test(error.message)
  );

  assert.ok(calls.some((call) => call.kind === "detach"));
  assert.equal(calls.some((call) => call.kind === "download"), false);
});

test("a cleanup failure after a successful screenshot remains CLEANUP_FAILED", async () => {
  const { api, calls } = createChromeMock({
    failCssRemoval: true,
    documentUrl: "https://example.com/cleanup-success"
  });

  await assert.rejects(
    executeCaptureRequest({
      api,
      tab: { id: 13, url: "https://example.com/cleanup-success" },
      request: { mode: "full-page", options: {} }
    }),
    (error) => error instanceof CaptureError && error.code === "CLEANUP_FAILED"
  );

  assert.ok(calls.some((call) => call.kind === "detach"));
  assert.equal(calls.some((call) => call.kind === "download"), false);
});

test("viewport capture does not emulate or request a beyond-viewport clip", async () => {
  const { api, calls } = createChromeMock({ documentUrl: "https://example.com/" });
  const [result] = await executeCaptureRequest({
    api,
    tab: { id: 9, url: "https://example.com/" },
    request: {
      mode: "viewport",
      options: { hideScrollbars: false, disableAnimations: false }
    },
    now: () => FIXED_DATE
  });

  assert.equal(result.filename, "example.com_home_viewport-1200x800_20260913-142530.png");
  assert.equal(calls.some((call) => call.kind === "insertCSS"), false);
  assert.equal(
    calls.some(
      (call) => call.kind === "command" && call.method === "Emulation.setDeviceMetricsOverride"
    ),
    false
  );
  const capture = calls.find(
    (call) => call.kind === "command" && call.method === "Page.captureScreenshot"
  );
  assert.equal(capture.params.captureBeyondViewport, false);
  assert.equal("clip" in capture.params, false);
});

test("capture set downloads four distinct files and uses four isolated debugger sessions", async () => {
  const { api, calls } = createChromeMock({ documentUrl: "https://example.com/layout" });
  const results = await executeCaptureRequest({
    api,
    tab: { id: 10, url: "https://example.com/layout" },
    request: { mode: "set", options: {} },
    now: () => FIXED_DATE
  });

  assert.deepEqual(
    results.map((result) => result.filename),
    [1440, 1280, 390, 430].map(
      (width) => `example.com_layout_${width}_20260913-142530.png`
    )
  );
  assert.equal(calls.filter((call) => call.kind === "attach").length, 4);
  assert.equal(calls.filter((call) => call.kind === "detach").length, 4);
  assert.equal(calls.filter((call) => call.kind === "download").length, 4);
});

test("navigation during capture aborts the job but still cleans up the tab", async () => {
  const { api, calls } = createChromeMock({
    documentUrl: "https://example.com/original",
    navigateOnSnapshotNumber: 2
  });

  await assert.rejects(
    executeCaptureRequest({
      api,
      tab: { id: 11, url: "https://example.com/original" },
      request: { mode: "full-page", options: {} }
    }),
    (error) => error instanceof CaptureError && error.code === "TAB_NAVIGATED"
  );

  assert.ok(calls.some((call) => call.kind === "removeCSS"));
  assert.ok(calls.some((call) => call.kind === "detach"));
  assert.equal(calls.some((call) => call.kind === "download"), false);
});

test("capture set aborts if the page reloads between responsive widths", async () => {
  const { api, calls } = createChromeMock({
    documentUrl: "https://example.com/set",
    changeTimeOriginAtSnapshotNumber: 4
  });

  await assert.rejects(
    executeCaptureRequest({
      api,
      tab: { id: 14, url: "https://example.com/set" },
      request: { mode: "set", options: {} }
    }),
    (error) => error instanceof CaptureError && error.code === "TAB_NAVIGATED"
  );

  assert.equal(calls.filter((call) => call.kind === "attach").length, 2);
  assert.equal(calls.filter((call) => call.kind === "detach").length, 2);
  assert.equal(calls.filter((call) => call.kind === "download").length, 1);
});

test("known raw Chrome errors are converted into actionable messages", () => {
  assert.match(toUserMessage(new Error("Another debugger is already attached")), /another debugger/i);
  assert.match(toUserMessage(new Error("No tab with given id 3.")), /closed or navigated/i);
  assert.match(toUserMessage(new Error("Cannot access contents of url")), /blocked access/i);
  assert.match(
    toUserMessage(new Error("Detached while handling command.")),
    /connection was interrupted/i
  );
  assert.match(toUserMessage(new Error("Internal error")), /could not render/i);
});

function createChromeMock({
  failCapture = false,
  failDownload = false,
  failCssRemoval = false,
  documentUrl = "https://example.com/",
  navigateOnSnapshotNumber = 0,
  changeTimeOriginAtSnapshotNumber = 0
} = {}) {
  const calls = [];
  let nextDownloadId = 41;
  const downloadStates = new Map();
  const downloadListeners = new Set();
  let snapshotNumber = 0;

  const api = {
    debugger: {
      async attach(target, version) {
        calls.push({ kind: "attach", target, version });
      },
      async sendCommand(target, method, params) {
        calls.push({ kind: "command", target, method, params });
        if (method === "Page.getLayoutMetrics") {
          return {
            cssLayoutViewport: { clientWidth: 1200, clientHeight: 800 },
            cssContentSize: { width: 1200, height: 3200 }
          };
        }
        if (method === "Page.captureScreenshot") {
          if (failCapture) {
            throw new Error("Page.captureScreenshot failed");
          }
          return { data: "iVBORw0KGgo=" };
        }
        return {};
      },
      async detach(target) {
        calls.push({ kind: "detach", target });
      }
    },
    scripting: {
      async insertCSS(details) {
        calls.push({ kind: "insertCSS", details });
      },
      async removeCSS(details) {
        calls.push({ kind: "removeCSS", details });
        if (failCssRemoval) {
          throw new Error("Could not remove injected CSS");
        }
      },
      async executeScript(details) {
        calls.push({ kind: "executeScript", details });
        if (details.func?.name === "readDocumentState") {
          snapshotNumber += 1;
          return [
            {
              result: {
                timeOrigin:
                  snapshotNumber === changeTimeOriginAtSnapshotNumber ? 54321 : 12345,
                url:
                  snapshotNumber === navigateOnSnapshotNumber
                    ? "https://example.com/navigated"
                    : documentUrl,
                scrollX: 0,
                scrollY: 240
              }
            }
          ];
        }
        if (details.func?.name === "restoreDocumentScroll") {
          return [{ result: { restored: true, navigated: false } }];
        }
        return [
          {
            result: {
              timeOrigin: 12345,
              url: documentUrl,
              innerWidth: 1200,
              innerHeight: 800,
              scrollWidth: 1200,
              scrollHeight: 3100
            }
          }
        ];
      }
    },
    runtime: {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      async getContexts(details) {
        calls.push({ kind: "getContexts", details });
        return [];
      },
      async sendMessage(message) {
        calls.push({ kind: "runtimeMessage", message });
        if (message.type === "finish-upload") {
          return { ok: true, blobUrl: `blob:mock/${message.token}` };
        }
        return { ok: true };
      }
    },
    offscreen: {
      async createDocument(details) {
        calls.push({ kind: "createOffscreen", details });
      },
      async closeDocument() {
        calls.push({ kind: "closeOffscreen" });
      }
    },
    downloads: {
      async download(details) {
        calls.push({ kind: "download", details });
        if (failDownload) {
          throw new Error("Download interrupted");
        }
        const id = nextDownloadId++;
        downloadStates.set(id, "complete");
        queueMicrotask(() => {
          for (const listener of downloadListeners) {
            listener({ id, state: { current: "complete" } });
          }
        });
        return id;
      },
      async search({ id }) {
        calls.push({ kind: "downloadSearch", id });
        return [{ id, state: downloadStates.get(id) || "in_progress" }];
      },
      onChanged: {
        addListener(listener) {
          downloadListeners.add(listener);
        },
        removeListener(listener) {
          downloadListeners.delete(listener);
        }
      }
    }
  };

  return { api, calls };
}
