(() => {
  "use strict";

  const WIDTH_MIN = 320;
  const WIDTH_MAX = 7680;
  const VALID_TONES = new Set(["neutral", "working", "success", "error"]);

  const app = document.querySelector("#app");
  const statusBar = document.querySelector("#status-bar");
  const statusMessage = document.querySelector("#status-message");
  const customForm = document.querySelector("#custom-width-form");
  const customWidth = document.querySelector("#custom-width");
  const widthError = document.querySelector("#width-error");
  const widthHint = document.querySelector("#width-hint");
  const hideScrollbars = document.querySelector("#hide-scrollbars");
  const disableAnimations = document.querySelector("#disable-animations");
  const captureControls = [...document.querySelectorAll("[data-capture-control]")];
  const captureButtons = [...document.querySelectorAll("button[data-mode]")];

  let port;

  function setControlsDisabled(disabled) {
    for (const control of captureControls) {
      control.disabled = disabled;
    }

    app.dataset.busy = String(disabled);
  }

  function renderState(state) {
    const busy = state?.busy === true;
    const tone = VALID_TONES.has(state?.tone) ? state.tone : busy ? "working" : "neutral";
    const message = typeof state?.status === "string" && state.status.trim()
      ? state.status.trim()
      : busy
        ? "Working…"
        : "Ready";

    setControlsDisabled(busy);
    statusBar.dataset.tone = tone;
    statusMessage.textContent = message;
  }

  function showConnectionError() {
    setControlsDisabled(true);
    statusBar.dataset.tone = "error";
    statusMessage.textContent = "Capture service unavailable. Reopen the popup.";
  }

  function postMessage(message) {
    try {
      port.postMessage(message);
      return true;
    } catch {
      showConnectionError();
      return false;
    }
  }

  function getOptions() {
    return {
      hideScrollbars: hideScrollbars.checked,
      disableAnimations: disableAnimations.checked,
    };
  }

  function requestCapture(mode, width) {
    const request = {
      mode,
      options: getOptions(),
    };

    if (width !== undefined) {
      request.width = width;
    }

    renderState({ busy: true, status: "Starting capture…", tone: "working" });
    postMessage({ type: "capture", request });
  }

  function clearWidthError() {
    customWidth.removeAttribute("aria-invalid");
    widthError.hidden = true;
    widthHint.hidden = false;
    customWidth.setCustomValidity("");
  }

  function getCustomWidth() {
    const rawValue = customWidth.value.trim();
    const width = Number(rawValue);
    const valid = /^\d+$/.test(rawValue)
      && Number.isInteger(width)
      && width >= WIDTH_MIN
      && width <= WIDTH_MAX;

    if (!valid) {
      customWidth.setAttribute("aria-invalid", "true");
      customWidth.setCustomValidity(`Enter a whole number from ${WIDTH_MIN} to ${WIDTH_MAX}.`);
      widthHint.hidden = true;
      widthError.hidden = false;
      return null;
    }

    clearWidthError();
    return width;
  }

  for (const button of captureButtons) {
    button.addEventListener("click", () => {
      const width = button.dataset.width === undefined
        ? undefined
        : Number(button.dataset.width);

      requestCapture(button.dataset.mode, width);
    });
  }

  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const width = getCustomWidth();

    if (width === null) {
      customWidth.focus();
      return;
    }

    requestCapture("responsive", width);
  });

  customWidth.addEventListener("input", clearWidthError);

  try {
    port = chrome.runtime.connect({ name: "capture-control" });

    port.onMessage.addListener((message) => {
      if (message?.type === "state") {
        renderState(message.state);
      }
    });

    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      showConnectionError();
    });

    postMessage({ type: "get-state" });
  } catch {
    showConnectionError();
  }
})();
