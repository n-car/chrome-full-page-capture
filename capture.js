import { downloadPng } from "./download.js";

const PROTOCOL_VERSION = "1.3";
const MIN_WIDTH = 320;
const MAX_WIDTH = 7680;
const DESKTOP_HEIGHT = 900;

export const RESPONSIVE_PRESETS = Object.freeze([
  Object.freeze({ width: 1440, height: DESKTOP_HEIGHT, mobile: false }),
  Object.freeze({ width: 1280, height: DESKTOP_HEIGHT, mobile: false }),
  Object.freeze({ width: 390, height: 844, mobile: true }),
  Object.freeze({ width: 430, height: 932, mobile: true })
]);

const RESTRICTED_STORE_HOSTS = new Set([
  "chromewebstore.google.com",
  "chrome.google.com"
]);

export class CaptureError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "CaptureError";
    this.code = code;
  }
}

export function normalizeCaptureRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== "object") {
    throw new CaptureError("INVALID_REQUEST", "The capture request is not valid.");
  }

  const allowedModes = new Set(["full-page", "viewport", "responsive", "set"]);
  if (!allowedModes.has(rawRequest.mode)) {
    throw new CaptureError("INVALID_REQUEST", "Choose a valid capture mode.");
  }

  const request = {
    mode: rawRequest.mode,
    options: {
      hideScrollbars: rawRequest.options?.hideScrollbars !== false,
      disableAnimations: rawRequest.options?.disableAnimations !== false
    }
  };

  if (request.mode === "responsive") {
    const width = Number(rawRequest.width);
    if (!Number.isInteger(width) || width < MIN_WIDTH || width > MAX_WIDTH) {
      throw new CaptureError(
        "INVALID_WIDTH",
        `Enter a whole width from ${MIN_WIDTH} to ${MAX_WIDTH} px.`
      );
    }
    request.width = width;
    request.mobile =
      typeof rawRequest.mobile === "boolean"
        ? rawRequest.mobile
        : width === 390 || width === 430;
  }

  return request;
}

export function createCapturePlan(rawRequest) {
  const request = normalizeCaptureRequest(rawRequest);

  if (request.mode === "set") {
    return RESPONSIVE_PRESETS.map((preset) => ({
      ...preset,
      mode: "responsive",
      options: request.options,
      label: String(preset.width)
    }));
  }

  if (request.mode === "responsive") {
    const preset = RESPONSIVE_PRESETS.find(
      (candidate) => candidate.width === request.width && candidate.mobile === request.mobile
    );
    return [
      {
        mode: "responsive",
        width: request.width,
        height: preset?.height ?? DESKTOP_HEIGHT,
        mobile: request.mobile,
        options: request.options,
        label: String(request.width)
      }
    ];
  }

  return [
    {
      mode: request.mode,
      options: request.options,
      label: request.mode
    }
  ];
}

export function assertCapturableTab(tab) {
  if (!tab || !Number.isInteger(tab.id)) {
    throw new CaptureError("TAB_UNAVAILABLE", "The active tab is no longer available.");
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    throw new CaptureError("UNSUPPORTED_PAGE", "Open an HTTP or HTTPS page before capturing.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CaptureError(
      "UNSUPPORTED_PAGE",
      "Chrome internal pages and local files cannot be captured. Open an HTTP or HTTPS page."
    );
  }

  const isChromeWebStore =
    url.hostname === "chromewebstore.google.com" ||
    (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"));
  if (RESTRICTED_STORE_HOSTS.has(url.hostname) && isChromeWebStore) {
    throw new CaptureError(
      "RESTRICTED_PAGE",
      "Chrome does not allow extensions to capture the Chrome Web Store."
    );
  }

  return url;
}

export function sanitizeFilenamePart(value, fallback = "page", maxLength = 80) {
  const sanitized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%[0-9a-f]{2}/gi, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase()
    .slice(0, maxLength)
    .replace(/[-_.]+$/g, "");

  return sanitized || fallback;
}

export function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

export function buildFilename(pageUrl, label, date = new Date()) {
  const url = pageUrl instanceof URL ? pageUrl : new URL(pageUrl);
  const host = sanitizeFilenamePart(url.hostname, "site", 70);
  const decodedPath = safeDecodeURIComponent(url.pathname)
    .split("/")
    .filter(Boolean)
    .join("-");
  const path = sanitizeFilenamePart(decodedPath, "home", 80);
  const captureLabel = sanitizeFilenamePart(label, "capture", 32);
  return `${host}_${path}_${captureLabel}_${formatTimestamp(date)}.png`;
}

export function toUserMessage(error) {
  if (error instanceof CaptureError) {
    return error.message;
  }
  if (error?.code === "DOWNLOAD_FAILED") {
    return error.message;
  }

  const message = String(error?.message || error || "Unknown error");
  const normalized = message.toLowerCase();

  if (normalized.includes("restricted by policy") || normalized.includes("host access is restricted")) {
    return "A Chrome or organization policy blocks screenshots on this page.";
  }

  if (
    normalized.includes("another debugger") ||
    normalized.includes("already attached") ||
    normalized.includes("target is already being debugged")
  ) {
    return "Another debugger is already using this tab. Close DevTools or the other debugger and try again.";
  }
  if (errorMeansTargetGone(normalized)) {
    return "The tab was closed or navigated while the capture was running.";
  }
  if (
    normalized.includes("detached while handling command") ||
    normalized.includes("debugger is not attached")
  ) {
    return "The debugger connection was interrupted. The tab may have closed, or DevTools was opened during capture.";
  }
  if (
    normalized.includes("cannot access") ||
    normalized.includes("not allowed") ||
    normalized.includes("permission") ||
    normalized.includes("restricted")
  ) {
    return "Chrome blocked access to this page. Try a regular HTTP or HTTPS tab.";
  }
  if (normalized.includes("debugger") || normalized.includes("attach")) {
    return "Chrome could not attach the temporary debugger to this tab. Close DevTools and try again.";
  }
  if (normalized.includes("download")) {
    return "The screenshot was captured, but Chrome could not start the PNG download.";
  }
  if (normalized.includes("page is too large") || normalized.includes("image is too large")) {
    return "This page is too large for Chrome to capture as one image. Try a shorter page or a smaller responsive width.";
  }
  if (normalized.includes("internal error")) {
    return "Chrome could not render the screenshot. Reload the page and try again.";
  }
  if (normalized.includes("screenshot") || normalized.includes("capture")) {
    return "Chrome could not capture this page. Very large or protected pages may exceed browser limits.";
  }

  return `Capture failed: ${message.slice(0, 180)}`;
}

export async function executeCaptureRequest({
  api = chrome,
  tab,
  request: rawRequest,
  onProgress = () => {},
  now = () => new Date()
}) {
  const pageUrl = assertCapturableTab(tab);
  const expectedDocumentUrl = comparableDocumentUrl(pageUrl);
  const plan = createCapturePlan(rawRequest);
  const isSet = plan.length > 1;
  const results = [];
  let expectedTimeOrigin;

  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index];
    const prefix = isSet
      ? `Capturing ${index + 1}/${plan.length} — ${step.width} px`
      : captureHeading(step);
    const progress = (detail) => onProgress(detail ? `${prefix} · ${detail}` : prefix);

    progress("Preparing page…");
    const image = await capturePng({
      api,
      tabId: tab.id,
      step,
      expectedDocumentUrl,
      expectedTimeOrigin,
      onProgress: progress
    });
    expectedTimeOrigin ??= image.timeOrigin;
    const label = screenshotLabel(step, image.viewport);
    const filename = buildFilename(pageUrl, label, now());

    progress("Downloading…");
    const downloadId = await downloadPng(api, image.data, filename);
    results.push({ filename, downloadId, viewport: image.viewport });
  }

  return results;
}

async function capturePng({
  api,
  tabId,
  step,
  expectedDocumentUrl,
  expectedTimeOrigin,
  onProgress
}) {
  const target = { tabId };
  const temporaryCss = buildTemporaryCss(step.options);
  let attached = false;
  let cssCleanupNeeded = false;
  let metricsCleanupNeeded = false;
  let touchCleanupNeeded = false;
  let pageState;
  let primaryError;
  const cleanupErrors = [];
  let screenshot;

  try {
    try {
      await api.debugger.attach(target, PROTOCOL_VERSION);
      attached = true;
    } catch (error) {
      throw new CaptureError(
        "DEBUGGER_ATTACH_FAILED",
        toUserMessage(error),
        error
      );
    }

    await api.debugger.sendCommand(target, "Page.enable");

    pageState = await snapshotDocumentState(api, tabId);
    assertSameDocument(
      pageState,
      expectedDocumentUrl,
      expectedTimeOrigin ?? pageState.timeOrigin
    );

    if (temporaryCss) {
      cssCleanupNeeded = true;
      await api.scripting.insertCSS({
        target: { tabId },
        css: temporaryCss,
        origin: "USER"
      });
    }

    if (step.mode === "responsive") {
      onProgress("Applying responsive viewport…");
      metricsCleanupNeeded = true;
      await api.debugger.sendCommand(target, "Emulation.setDeviceMetricsOverride", {
        width: step.width,
        height: step.height,
        deviceScaleFactor: 1,
        mobile: step.mobile,
        screenWidth: step.width,
        screenHeight: step.height
      });

      if (step.mobile) {
        touchCleanupNeeded = true;
        await api.debugger.sendCommand(target, "Emulation.setTouchEmulationEnabled", {
          enabled: true,
          maxTouchPoints: 5
        });
      }
    }

    const fullPage = step.mode !== "viewport";
    const preparation = await preparePage(api, tabId, fullPage);
    assertSameDocument(preparation, expectedDocumentUrl, pageState.timeOrigin);
    onProgress("Measuring layout…");
    const metrics = await api.debugger.sendCommand(target, "Page.getLayoutMetrics");
    const viewport = resolveViewport(step, metrics, preparation);
    assertSameDocument(
      await snapshotDocumentState(api, tabId),
      expectedDocumentUrl,
      pageState.timeOrigin
    );

    onProgress("Capturing PNG…");
    const captureParams = {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: fullPage
    };

    const result = await api.debugger.sendCommand(
      target,
      "Page.captureScreenshot",
      captureParams
    );
    if (!result?.data) {
      throw new CaptureError(
        "CAPTURE_FAILED",
        "Chrome returned an empty screenshot. Reload the page and try again."
      );
    }

    assertSameDocument(
      await snapshotDocumentState(api, tabId),
      expectedDocumentUrl,
      pageState.timeOrigin
    );

    screenshot = { data: result.data, viewport, timeOrigin: pageState.timeOrigin };
  } catch (error) {
    primaryError = error;
  } finally {
    if (attached && touchCleanupNeeded) {
      try {
        await api.debugger.sendCommand(target, "Emulation.setTouchEmulationEnabled", {
          enabled: false,
          maxTouchPoints: 1
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (attached && metricsCleanupNeeded) {
      try {
        await api.debugger.sendCommand(target, "Emulation.clearDeviceMetricsOverride");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (pageState) {
      try {
        const restoreResult = await restoreDocumentState(api, tabId, pageState);
        if (restoreResult?.restored !== true) {
          throw new Error(
            restoreResult?.navigated
              ? "The tab navigated before its scroll position could be restored."
              : "Chrome could not confirm that the original scroll position was restored."
          );
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cssCleanupNeeded) {
      try {
        await api.scripting.removeCSS({
          target: { tabId },
          css: temporaryCss,
          origin: "USER"
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (attached) {
      try {
        await api.debugger.detach(target);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

  }

  if (cleanupErrors.length > 0 && !allErrorsMeanTabClosed(cleanupErrors)) {
    if (primaryError) {
      primaryError = new CaptureError(
        "CAPTURE_AND_CLEANUP_FAILED",
        `${toUserMessage(primaryError)} Chrome also could not confirm that the page was fully restored; reload the tab before continuing.`,
        primaryError
      );
    } else {
      primaryError = new CaptureError(
        "CLEANUP_FAILED",
        "The screenshot was captured, but Chrome could not fully restore the page. Reload the tab before continuing.",
        cleanupErrors[0]
      );
    }
  }

  if (primaryError) {
    if (primaryError instanceof CaptureError) {
      throw primaryError;
    }
    throw new CaptureError("CAPTURE_FAILED", toUserMessage(primaryError), primaryError);
  }

  return screenshot;
}

function buildTemporaryCss(options) {
  const rules = [];

  if (options.hideScrollbars) {
    rules.push(`
      * {
        scrollbar-color: transparent transparent !important;
      }
      *::-webkit-scrollbar,
      *::-webkit-scrollbar-track,
      *::-webkit-scrollbar-track-piece,
      *::-webkit-scrollbar-thumb,
      *::-webkit-scrollbar-button,
      *::-webkit-scrollbar-corner {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }
    `);
  }

  if (options.disableAnimations) {
    rules.push(`
      html,
      html:focus-within,
      body,
      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        animation-play-state: paused !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `);
  }

  return rules.join("\n").trim();
}

async function preparePage(api, tabId, scanFullPage) {
  let injectionResults;
  try {
    injectionResults = await api.scripting.executeScript({
      target: { tabId },
      func: prepareDocumentForCapture,
      args: [{ scanFullPage }]
    });
  } catch (error) {
    throw new CaptureError("PAGE_ACCESS_FAILED", toUserMessage(error), error);
  }

  const result = injectionResults?.[0]?.result;
  if (!result) {
    throw new CaptureError(
      "PAGE_ACCESS_FAILED",
      "Chrome could not prepare this page for capture. Reload it and try again."
    );
  }
  return result;
}

async function prepareDocumentForCapture({ scanFullPage }) {
  const wait = (milliseconds) =>
    new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
  const withTimeout = (promise, milliseconds) =>
    Promise.race([promise, wait(milliseconds)]);
  const originalScroll = { x: window.scrollX, y: window.scrollY };
  const lazyElements = Array.from(
    document.querySelectorAll('img[loading="lazy"], iframe[loading="lazy"]')
  ).map((element) => ({
    element,
    value: element.getAttribute("loading")
  }));

  try {
    await withTimeout(
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
      300
    );
    await wait(220);

    for (const { element } of lazyElements) {
      element.setAttribute("loading", "eager");
    }

    if (document.fonts?.ready) {
      await withTimeout(document.fonts.ready.catch(() => undefined), 2000);
    }

    if (scanFullPage) {
      const deadline = Date.now() + 4500;
      let y = 0;
      let stableBottomPasses = 0;

      window.scrollTo({ left: 0, top: 0, behavior: "instant" });
      await wait(70);

      while (Date.now() < deadline && stableBottomPasses < 2) {
        const root = document.documentElement;
        const body = document.body;
        const height = Math.max(
          root?.scrollHeight || 0,
          root?.offsetHeight || 0,
          body?.scrollHeight || 0,
          body?.offsetHeight || 0,
          window.innerHeight
        );
        const bottom = Math.max(0, height - window.innerHeight);
        const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
        y = Math.min(bottom, y + step);
        window.scrollTo({ left: 0, top: y, behavior: "instant" });
        await wait(70);

        if (y >= bottom) {
          const newHeight = Math.max(
            document.documentElement?.scrollHeight || 0,
            document.body?.scrollHeight || 0,
            window.innerHeight
          );
          if (newHeight <= height + 1) {
            stableBottomPasses += 1;
          } else {
            stableBottomPasses = 0;
          }
        }
      }
    }

    const candidateImages = Array.from(document.images).filter((image) => {
      if (scanFullPage) {
        return true;
      }
      const rect = image.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= window.innerHeight;
    });
    await Promise.allSettled(candidateImages.map(waitForImage));

    async function waitForImage(image) {
      if (!image.complete) {
        await new Promise((resolve) => {
          let timeoutId;
          const finish = () => {
            globalThis.clearTimeout(timeoutId);
            image.removeEventListener("load", finish);
            image.removeEventListener("error", finish);
            resolve();
          };
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
          timeoutId = globalThis.setTimeout(finish, 1600);
          if (image.complete) {
            finish();
          }
        });
      }
      if (typeof image.decode === "function") {
        await withTimeout(image.decode().catch(() => undefined), 400);
      }
    }
  } finally {
    for (const { element, value } of lazyElements) {
      if (element.isConnected) {
        if (value === null) {
          element.removeAttribute("loading");
        } else {
          element.setAttribute("loading", value);
        }
      }
    }
    window.scrollTo({ left: originalScroll.x, top: originalScroll.y, behavior: "instant" });
    await wait(160);
  }

  const root = document.documentElement;
  const body = document.body;
  return {
    timeOrigin: performance.timeOrigin,
    url: location.href,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: Math.max(
      root?.scrollWidth || 0,
      root?.offsetWidth || 0,
      body?.scrollWidth || 0,
      body?.offsetWidth || 0,
      window.innerWidth
    ),
    scrollHeight: Math.max(
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      window.innerHeight
    )
  };
}

async function snapshotDocumentState(api, tabId) {
  let injectionResults;
  try {
    injectionResults = await api.scripting.executeScript({
      target: { tabId },
      func: readDocumentState
    });
  } catch (error) {
    throw new CaptureError("PAGE_ACCESS_FAILED", toUserMessage(error), error);
  }

  const result = injectionResults?.[0]?.result;
  if (!result || !Number.isFinite(result.timeOrigin) || typeof result.url !== "string") {
    throw new CaptureError(
      "PAGE_ACCESS_FAILED",
      "Chrome could not read this page before capture. Reload it and try again."
    );
  }
  result.urlKey = comparableDocumentUrl(result.url);
  return result;
}

function assertSameDocument(state, expectedUrl, expectedTimeOrigin = state?.timeOrigin) {
  if (
    !state ||
    state.timeOrigin !== expectedTimeOrigin ||
    comparableDocumentUrl(state.url) !== expectedUrl
  ) {
    throw new CaptureError(
      "TAB_NAVIGATED",
      "The tab navigated while the capture was running. Return to the page and try again."
    );
  }
}

function comparableDocumentUrl(value) {
  try {
    const url = value instanceof URL ? new URL(value.href) : new URL(value);
    return url.href;
  } catch {
    return "";
  }
}

function readDocumentState() {
  return {
    timeOrigin: performance.timeOrigin,
    url: location.href,
    scrollX: window.scrollX,
    scrollY: window.scrollY
  };
}

async function restoreDocumentState(api, tabId, pageState) {
  const injectionResults = await api.scripting.executeScript({
    target: { tabId },
    func: restoreDocumentScroll,
    args: [pageState]
  });
  return injectionResults?.[0]?.result;
}

async function restoreDocumentScroll(pageState) {
  const currentUrl = new URL(location.href);
  if (performance.timeOrigin !== pageState.timeOrigin || currentUrl.href !== pageState.urlKey) {
    return { restored: false, navigated: true };
  }

  window.scrollTo({
    left: pageState.scrollX,
    top: pageState.scrollY,
    behavior: "instant"
  });
  await Promise.race([
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }),
    new Promise((resolve) => globalThis.setTimeout(resolve, 300))
  ]);
  return { restored: true, navigated: false };
}

function resolveViewport(step, metrics, preparation) {
  const layoutViewport = metrics?.cssLayoutViewport || metrics?.layoutViewport || {};
  const contentSize = metrics?.cssContentSize || metrics?.contentSize || {};
  const width = Math.max(
    1,
    Math.ceil(
      step.mode === "responsive"
        ? step.width
        : layoutViewport.clientWidth || preparation.innerWidth
    )
  );
  const height = Math.max(
    1,
    Math.ceil(layoutViewport.clientHeight || preparation.innerHeight)
  );
  const contentHeight = Math.max(
    height,
    Math.ceil(contentSize.height || 0),
    Math.ceil(preparation.scrollHeight || 0)
  );

  if (![width, height, contentHeight].every(Number.isFinite)) {
    throw new CaptureError(
      "MEASUREMENT_FAILED",
      "Chrome returned invalid page dimensions. Reload the page and try again."
    );
  }

  return { width, height, contentHeight };
}

function captureHeading(step) {
  if (step.mode === "viewport") {
    return "Capturing viewport";
  }
  if (step.mode === "full-page") {
    return "Capturing full page";
  }
  return `Capturing ${step.width} px`;
}

function screenshotLabel(step, viewport) {
  if (step.mode === "responsive") {
    return String(step.width);
  }
  if (step.mode === "viewport") {
    return `viewport-${viewport.width}x${viewport.height}`;
  }
  return `full-${viewport.width}`;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function allErrorsMeanTabClosed(errors) {
  return errors.every((error) => {
    const message = String(error?.message || error || "").toLowerCase();
    return (
      errorMeansTargetGone(message) ||
      message.includes("not attached") ||
      message.includes("detached while handling command")
    );
  });
}

function errorMeansTargetGone(message) {
  return (
    /no (?:tab|target) with (?:given )?id/.test(message) ||
    message.includes("target closed") ||
    message.includes("inspected target navigated or closed")
  );
}
