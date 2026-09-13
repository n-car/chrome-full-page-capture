import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const offscreenSource = readFileSync(join(projectRoot, "offscreen.js"), "utf8");

test("offscreen Blob assembly rejects missing chunks", async () => {
  const harness = createOffscreenHarness();

  assert.equal(
    (await harness.send({ type: "begin-upload", token: "missing", totalChunks: 3 })).ok,
    true
  );
  await harness.send({ type: "upload-chunk", token: "missing", index: 0, data: "QUI=" });
  await harness.send({ type: "upload-chunk", token: "missing", index: 2, data: "RA==" });
  const response = await harness.send({ type: "finish-upload", token: "missing" });

  assert.equal(response.ok, false);
  assert.match(response.error, /incomplete/i);
  assert.equal(harness.createdBlobs.length, 0);
});

test("offscreen Blob assembly decodes all chunks in order and revokes its URL", async () => {
  const harness = createOffscreenHarness();

  await harness.send({ type: "begin-upload", token: "complete", totalChunks: 2, mimeType: "image/png" });
  await harness.send({ type: "upload-chunk", token: "complete", index: 0, data: "QUI=" });
  await harness.send({ type: "upload-chunk", token: "complete", index: 1, data: "Q0Q=" });
  const response = await harness.send({ type: "finish-upload", token: "complete" });

  assert.equal(response.ok, true);
  assert.equal(response.blobUrl, "blob:test/1");
  assert.equal(harness.createdBlobs.length, 1);
  assert.equal(harness.createdBlobs[0].type, "image/png");
  assert.equal(Buffer.from(await harness.createdBlobs[0].arrayBuffer()).toString("utf8"), "ABCD");

  await harness.send({ type: "revoke-url", token: "complete" });
  assert.deepEqual(harness.revokedUrls, ["blob:test/1"]);
});

function createOffscreenHarness() {
  let listener;
  const createdBlobs = [];
  const revokedUrls = [];
  const FakeURL = {
    createObjectURL(blob) {
      createdBlobs.push(blob);
      return `blob:test/${createdBlobs.length}`;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    }
  };
  const chrome = {
    runtime: {
      onMessage: {
        addListener(callback) {
          listener = callback;
        }
      },
      async sendMessage() {
        return { ok: true };
      }
    }
  };
  const context = {
    atob,
    Blob,
    chrome,
    console,
    Uint8Array,
    URL: FakeURL,
    setInterval() {
      return 1;
    }
  };
  context.globalThis = context;
  vm.runInNewContext(offscreenSource, context, { filename: "offscreen.js" });

  return {
    createdBlobs,
    revokedUrls,
    send(message) {
      return new Promise((resolve) => {
        const handled = listener({ target: "offscreen", ...message }, {}, resolve);
        assert.equal(handled, true);
      });
    }
  };
}
