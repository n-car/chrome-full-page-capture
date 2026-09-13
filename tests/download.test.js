import test from "node:test";
import assert from "node:assert/strict";

import { DownloadError, downloadPng } from "../download.js";

test("large PNG payloads are transferred in bounded chunks and downloaded from a Blob URL", async () => {
  const { api, calls } = createDownloadMock({ state: "complete" });
  const largeBase64 = "A".repeat(1_100_000);

  const id = await downloadPng(api, largeBase64, "example_page_1440_date.png");

  assert.equal(id, 77);
  const chunks = calls.filter((call) => call.kind === "message" && call.message.type === "upload-chunk");
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.message.data.length <= 512 * 1024));
  assert.deepEqual(
    calls.find((call) => call.kind === "download").details,
    {
      url: "blob:mock/capture",
      filename: "example_page_1440_date.png",
      conflictAction: "uniquify",
      saveAs: false
    }
  );
  assert.ok(calls.some((call) => call.kind === "message" && call.message.type === "revoke-url"));
  assert.ok(calls.some((call) => call.kind === "closeOffscreen"));
});

test("an interrupted download is reported and the Blob URL is still revoked", async () => {
  const { api, calls } = createDownloadMock({ state: "interrupted", error: "USER_CANCELED" });

  await assert.rejects(
    downloadPng(api, "QUJDRA==", "capture.png"),
    (error) => error instanceof DownloadError && /complete the png download/i.test(error.message)
  );

  assert.ok(calls.some((call) => call.kind === "message" && call.message.type === "revoke-url"));
  assert.ok(calls.some((call) => call.kind === "closeOffscreen"));
});

test("offscreen creation errors become user-facing download errors", async () => {
  const { api, calls } = createDownloadMock({ failCreate: true });

  await assert.rejects(
    downloadPng(api, "QUJDRA==", "capture.png"),
    (error) => error instanceof DownloadError && error.code === "DOWNLOAD_FAILED"
  );
  assert.equal(calls.some((call) => call.kind === "download"), false);
});

function createDownloadMock({ state = "complete", error, failCreate = false } = {}) {
  const calls = [];
  const listeners = new Set();

  const api = {
    runtime: {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      async getContexts(details) {
        calls.push({ kind: "getContexts", details });
        return [];
      },
      async sendMessage(message) {
        calls.push({ kind: "message", message });
        if (message.type === "finish-upload") {
          return { ok: true, blobUrl: "blob:mock/capture" };
        }
        return { ok: true };
      }
    },
    offscreen: {
      async createDocument(details) {
        calls.push({ kind: "createOffscreen", details });
        if (failCreate) {
          throw new Error("Offscreen documents are unavailable");
        }
      },
      async closeDocument() {
        calls.push({ kind: "closeOffscreen" });
      }
    },
    downloads: {
      async download(details) {
        calls.push({ kind: "download", details });
        return 77;
      },
      async search(details) {
        calls.push({ kind: "search", details });
        return [{ id: 77, state, error }];
      },
      onChanged: {
        addListener(listener) {
          listeners.add(listener);
        },
        removeListener(listener) {
          listeners.delete(listener);
        }
      }
    }
  };

  return { api, calls, listeners };
}
