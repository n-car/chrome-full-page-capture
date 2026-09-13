import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconDirectory = join(projectRoot, "icons");
const SCALE = 4;

mkdirSync(iconDirectory, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const pixels = renderIcon(size * SCALE);
  const reduced = downsample(pixels, size * SCALE, size, SCALE);
  writeFileSync(join(iconDirectory, `icon${size}.png`), encodePng(size, size, reduced));
}

function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const unit = size / 128;
  const backgroundRadius = 27 * unit;

  for (let y = 0; y < size; y += 1) {
    const mix = y / Math.max(1, size - 1);
    const color = [
      Math.round(15 + 7 * mix),
      Math.round(23 + 13 * mix),
      Math.round(42 + 17 * mix),
      255
    ];
    fillHorizontalRoundedSlice(pixels, size, y, 4 * unit, size - 4 * unit, 4 * unit, size - 4 * unit, backgroundRadius, color);
  }

  roundedRect(pixels, size, 38 * unit, 25 * unit, 90 * unit, 103 * unit, 8 * unit, [20, 31, 48, 255]);
  strokeRoundedRect(pixels, size, 38 * unit, 25 * unit, 90 * unit, 103 * unit, 8 * unit, 4 * unit, [232, 240, 247, 235]);

  line(pixels, size, 50 * unit, 48 * unit, 78 * unit, 48 * unit, 4 * unit, [99, 230, 190, 255]);
  line(pixels, size, 50 * unit, 63 * unit, 78 * unit, 63 * unit, 4 * unit, [173, 191, 207, 230]);
  line(pixels, size, 50 * unit, 78 * unit, 70 * unit, 78 * unit, 4 * unit, [173, 191, 207, 180]);

  const accent = [99, 230, 190, 255];
  const cornerWidth = 20 * unit;
  const stroke = 6 * unit;
  line(pixels, size, 17 * unit, 31 * unit, 17 * unit + cornerWidth, 31 * unit, stroke, accent);
  line(pixels, size, 17 * unit, 31 * unit, 17 * unit, 31 * unit + cornerWidth, stroke, accent);
  line(pixels, size, 111 * unit, 31 * unit, 111 * unit - cornerWidth, 31 * unit, stroke, accent);
  line(pixels, size, 111 * unit, 31 * unit, 111 * unit, 31 * unit + cornerWidth, stroke, accent);
  line(pixels, size, 17 * unit, 97 * unit, 17 * unit + cornerWidth, 97 * unit, stroke, accent);
  line(pixels, size, 17 * unit, 97 * unit, 17 * unit, 97 * unit - cornerWidth, stroke, accent);
  line(pixels, size, 111 * unit, 97 * unit, 111 * unit - cornerWidth, 97 * unit, stroke, accent);
  line(pixels, size, 111 * unit, 97 * unit, 111 * unit, 97 * unit - cornerWidth, stroke, accent);

  return pixels;
}

function fillHorizontalRoundedSlice(pixels, size, y, left, right, top, bottom, radius, color) {
  for (let x = 0; x < size; x += 1) {
    if (insideRoundedRect(x + 0.5, y + 0.5, left, top, right, bottom, radius)) {
      blendPixel(pixels, size, x, y, color);
    }
  }
}

function roundedRect(pixels, size, left, top, right, bottom, radius, color) {
  const minX = Math.max(0, Math.floor(left));
  const maxX = Math.min(size, Math.ceil(right));
  const minY = Math.max(0, Math.floor(top));
  const maxY = Math.min(size, Math.ceil(bottom));
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if (insideRoundedRect(x + 0.5, y + 0.5, left, top, right, bottom, radius)) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
}

function strokeRoundedRect(pixels, size, left, top, right, bottom, radius, strokeWidth, color) {
  const inner = {
    left: left + strokeWidth,
    top: top + strokeWidth,
    right: right - strokeWidth,
    bottom: bottom - strokeWidth,
    radius: Math.max(0, radius - strokeWidth)
  };
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(size, Math.ceil(bottom)); y += 1) {
    for (let x = Math.max(0, Math.floor(left)); x < Math.min(size, Math.ceil(right)); x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (
        insideRoundedRect(px, py, left, top, right, bottom, radius) &&
        !insideRoundedRect(px, py, inner.left, inner.top, inner.right, inner.bottom, inner.radius)
      ) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x >= right || y < top || y >= bottom) {
    return false;
  }
  const centerX = Math.min(Math.max(x, left + radius), right - radius);
  const centerY = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function line(pixels, size, x1, y1, x2, y2, thickness, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - thickness));
  const maxX = Math.min(size, Math.ceil(Math.max(x1, x2) + thickness));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - thickness));
  const maxY = Math.min(size, Math.ceil(Math.max(y1, y2) + thickness));
  const radiusSquared = (thickness / 2) ** 2;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengthSquared = vx * vx + vy * vy || 1;

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const projection = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lengthSquared));
      const dx = px - (x1 + projection * vx);
      const dy = py - (y1 + projection * vy);
      if (dx * dx + dy * dy <= radiusSquared) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
}

function blendPixel(pixels, size, x, y, [red, green, blue, alpha]) {
  const offset = (y * size + x) * 4;
  const sourceAlpha = alpha / 255;
  const destinationAlpha = pixels[offset + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha === 0) {
    return;
  }
  pixels[offset] = Math.round((red * sourceAlpha + pixels[offset] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[offset + 1] = Math.round((green * sourceAlpha + pixels[offset + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[offset + 2] = Math.round((blue * sourceAlpha + pixels[offset + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[offset + 3] = Math.round(outputAlpha * 255);
}

function downsample(source, sourceSize, targetSize, scale) {
  const target = new Uint8Array(targetSize * targetSize * 4);
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const sourceOffset = ((y * scale + offsetY) * sourceSize + x * scale + offsetX) * 4;
          sums[0] += source[sourceOffset];
          sums[1] += source[sourceOffset + 1];
          sums[2] += source[sourceOffset + 2];
          sums[3] += source[sourceOffset + 3];
        }
      }
      const targetOffset = (y * targetSize + x) * 4;
      const samples = scale * scale;
      for (let channel = 0; channel < 4; channel += 1) {
        target[targetOffset + channel] = Math.round(sums[channel] / samples);
      }
    }
  }
  return target;
}

function encodePng(width, height, rgba) {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return result;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
