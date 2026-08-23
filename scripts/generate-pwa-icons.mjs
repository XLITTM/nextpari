import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BG = [15, 23, 42, 255];
const FG = [16, 185, 129, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, size, x0, y0, x1, y1, color) {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(size - 1, Math.ceil(x1));
  const yb = Math.min(size - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) setPixel(rgba, size, x, y, color);
  }
}

function fillRoundedRect(rgba, size, color) {
  const r = size * 0.22;
  const r2 = r * r;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inCorner =
        (x < r && y < r && (x - r) ** 2 + (y - r) ** 2 > r2) ||
        (x >= size - r && y < r && (x - (size - 1 - r)) ** 2 + (y - r) ** 2 > r2) ||
        (x < r && y >= size - r && (x - r) ** 2 + (y - (size - 1 - r)) ** 2 > r2) ||
        (x >= size - r && y >= size - r && (x - (size - 1 - r)) ** 2 + (y - (size - 1 - r)) ** 2 > r2);
      if (!inCorner) setPixel(rgba, size, x, y, color);
    }
  }
}

function fillPolygon(rgba, size, points, color) {
  let minY = size;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(size - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i += 2) {
      const a = Math.max(0, Math.floor(xs[i]));
      const b = Math.min(size - 1, Math.ceil(xs[i + 1] ?? xs[i]));
      for (let x = a; x <= b; x++) setPixel(rgba, size, x, y, color);
    }
  }
}

function drawN(rgba, size) {
  const pad = size * 0.22;
  const left = pad;
  const right = size - pad;
  const top = pad * 1.05;
  const bottom = size - pad * 0.95;
  const stem = size * 0.16;
  const slant = size * 0.12;

  fillRect(rgba, size, left, top, left + stem, bottom, FG);
  fillRect(rgba, size, right - stem, top, right, bottom, FG);
  fillPolygon(rgba, size, [
    [left + stem * 0.35, top],
    [left + stem + slant, top],
    [right - stem * 0.2, bottom],
    [right - stem - slant, bottom],
  ], FG);
}

function makeIcon(size, rounded) {
  const rgba = Buffer.alloc(size * size * 4);
  if (rounded) fillRoundedRect(rgba, size, BG);
  else fillRect(rgba, size, 0, 0, size - 1, size - 1, BG);
  drawN(rgba, size);
  return encodePng(size, size, rgba);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });
writeFileSync(join(iconsDir, 'icon-192.png'), makeIcon(192, true));
writeFileSync(join(iconsDir, 'icon-512.png'), makeIcon(512, true));
writeFileSync(join(root, 'public', 'apple-touch-icon.png'), makeIcon(180, false));
console.log('Wrote icon-192.png, icon-512.png, apple-touch-icon.png');
