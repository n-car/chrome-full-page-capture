import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(projectRoot, "manifest.json");
const failures = [];
const checks = [];

function check(condition, message) {
  if (condition) {
    checks.push(message);
  } else {
    failures.push(message);
  }
}

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function markdownAnchors(source) {
  const anchors = new Set();
  const occurrences = new Map();

  for (const line of source.split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!headingMatch) {
      continue;
    }

    const base = headingMatch[1]
      .replace(/<[^>]*>/g, "")
      .replace(/[`*_~]/g, "")
      .toLocaleLowerCase("it")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    if (!base) {
      continue;
    }

    const occurrence = occurrences.get(base) || 0;
    anchors.add(occurrence === 0 ? base : `${base}-${occurrence}`);
    occurrences.set(base, occurrence + 1);
  }

  return anchors;
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  checks.push("manifest.json is valid JSON");
} catch (error) {
  failures.push(`manifest.json is invalid: ${error.message}`);
  manifest = {};
}

let packageMetadata;
try {
  packageMetadata = JSON.parse(read("package.json"));
  checks.push("package.json is valid JSON");
} catch (error) {
  failures.push(`package.json is invalid: ${error.message}`);
  packageMetadata = {};
}

check(manifest.manifest_version === 3, "manifest uses Manifest V3");
check(manifest.name === "Full Page Capture", "manifest name is correct");
check(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version || ""), "manifest version is valid");
check(manifest.version === packageMetadata.version, "manifest and package versions match");
check(
  JSON.stringify([...(manifest.permissions || [])].sort()) ===
    JSON.stringify(["activeTab", "debugger", "downloads", "offscreen", "scripting"].sort()),
  "manifest has only the five required permissions"
);
check(!("host_permissions" in manifest), "manifest has no persistent host permissions");
check(
  Number.parseInt(manifest.minimum_chrome_version, 10) >= 118,
  "minimum Chrome version protects debugger service-worker lifetime"
);

const referencedFiles = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.action?.default_icon || {}),
  ...Object.values(manifest.icons || {})
]);

for (const relativePath of referencedFiles) {
  check(
    typeof relativePath === "string" && existsSync(join(projectRoot, relativePath)),
    `manifest reference exists: ${relativePath}`
  );
}

for (const relativePath of [
  "popup.html",
  "popup.css",
  "popup.js",
  "capture.js",
  "download.js",
  "offscreen.html",
  "offscreen.js",
  "service-worker.js",
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "PRIVACY.md",
  "SECURITY.md",
  "docs/usage.md",
  "docs/architecture.md",
  "docs/testing.md",
  "docs/limitations.md",
  "test-page/index.html"
]) {
  check(existsSync(join(projectRoot, relativePath)), `required project file exists: ${relativePath}`);
}

for (const relativePath of [
  "capture.js",
  "download.js",
  "offscreen.js",
  "service-worker.js",
  "popup.js"
]) {
  try {
    execFileSync(process.execPath, ["--check", join(projectRoot, relativePath)], {
      stdio: "pipe"
    });
    checks.push(`JavaScript syntax is valid: ${relativePath}`);
  } catch (error) {
    failures.push(`JavaScript syntax failed: ${relativePath}: ${error.stderr?.toString() || error.message}`);
  }
}

const popupHtml = read("popup.html");
const readme = read("README.md");
check(
  readme.includes(`Versione: **${manifest.version}**`),
  "README displays the current manifest version"
);
check(
  readme.includes(`full-page-capture-${manifest.version}.zip`),
  "README names the current release archive"
);
check(popupHtml.includes('href="popup.css"'), "popup references popup.css");
check(popupHtml.includes('src="popup.js"'), "popup references popup.js");
check(!/<script[^>]+src=["']https?:/i.test(popupHtml), "popup loads no remote scripts");

const offscreenHtml = read("offscreen.html");
check(offscreenHtml.includes('src="offscreen.js"'), "offscreen document references its local script");
check(!/<script(?![^>]+src=)[^>]*>/i.test(offscreenHtml), "offscreen document has no inline script");

const popupJs = read("popup.js");
const workerJs = read("service-worker.js");
check(
  popupJs.includes('name: "capture-control"') && workerJs.includes('"capture-control"'),
  "popup and service worker use the same port name"
);
check(
  popupJs.includes('type: "capture"') && workerJs.includes('message?.type === "capture"'),
  "popup and service worker agree on capture messages"
);
check(
  popupJs.includes('type: "get-state"') && workerJs.includes('message?.type === "get-state"'),
  "popup and service worker agree on state messages"
);

const captureJs = read("capture.js");
check(captureJs.includes("finally {"), "capture implementation has mandatory finally cleanup");
check(
  captureJs.includes('"Emulation.clearDeviceMetricsOverride"'),
  "device emulation is explicitly cleared"
);
check(captureJs.includes("api.debugger.detach"), "debugger is explicitly detached");
check(captureJs.includes("api.scripting.removeCSS"), "temporary CSS is explicitly removed");
check(
  captureJs.includes("captureBeyondViewport: fullPage"),
  "full-page capture uses captureBeyondViewport"
);
check(!captureJs.includes("captureParams.clip"), "full-page capture lets CDP determine the final bounds");

const downloadJs = read("download.js");
check(downloadJs.includes("BASE64_CHUNK_SIZE"), "large PNG payloads are chunked for offscreen transfer");
check(downloadJs.includes("waitForDownload"), "Blob URL remains alive until download completion");

check(
  manifest.commands?.["capture-full-page"]?.suggested_key?.default === "Ctrl+Shift+Y",
  "full-page keyboard shortcut is declared"
);

const runtimeSources = [
  popupHtml,
  read("popup.css"),
  popupJs,
  workerJs,
  captureJs,
  downloadJs,
  offscreenHtml,
  read("offscreen.js")
].join("\n");
check(!/\b(?:TODO|FIXME|PLACEHOLDER)\b/.test(runtimeSources), "runtime contains no TODOs or placeholders");
check(!/\b(?:fetch|XMLHttpRequest)\s*\(/.test(runtimeSources), "runtime performs no network requests");

for (const size of [16, 32, 48, 128]) {
  const relativePath = `icons/icon${size}.png`;
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`icon missing: ${relativePath}`);
    continue;
  }
  const data = readFileSync(absolutePath);
  const pngSignature = data.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  const width = data.length >= 24 ? data.readUInt32BE(16) : 0;
  const height = data.length >= 24 ? data.readUInt32BE(20) : 0;
  check(pngSignature && width === size && height === size, `${relativePath} is a ${size}x${size} PNG`);
  check(statSync(absolutePath).size > 100, `${relativePath} is not empty`);
}

const markdownFiles = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "PRIVACY.md",
  "SECURITY.md",
  "docs/usage.md",
  "docs/architecture.md",
  "docs/testing.md",
  "docs/limitations.md"
];

for (const relativePath of markdownFiles) {
  const sourcePath = join(projectRoot, relativePath);
  const source = read(relativePath);
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim();
    if (!rawTarget || /^[a-z][a-z\d+.-]*:/i.test(rawTarget)) {
      continue;
    }

    const hashIndex = rawTarget.indexOf("#");
    const rawPath = (hashIndex === -1 ? rawTarget : rawTarget.slice(0, hashIndex)).replace(
      /^<|>$/g,
      ""
    );
    const fragment = hashIndex === -1 ? "" : decodeURIComponent(rawTarget.slice(hashIndex + 1));
    const targetPath = rawPath
      ? resolve(dirname(sourcePath), decodeURIComponent(rawPath))
      : sourcePath;
    const targetExists = existsSync(targetPath);
    check(targetExists, `${relativePath} local link exists: ${rawTarget}`);

    if (targetExists && fragment && targetPath.toLowerCase().endsWith(".md")) {
      const anchors = markdownAnchors(readFileSync(targetPath, "utf8"));
      check(
        anchors.has(fragment),
        `${relativePath} local anchor exists: ${rawTarget}`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`Verification failed (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Verification passed (${checks.length} checks).`);
  for (const message of checks) {
    console.log(`  ✓ ${message}`);
  }
}
