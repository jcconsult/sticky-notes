/* Generates build/icon.ico from code, so the repo carries no binary assets.
 *
 * Each size is drawn independently and anti-aliased with a rounded-rectangle
 * signed-distance field, which stays crisp at 16px where a downscaled 256px
 * image would turn to mush.
 *
 *   node tools/make-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const BG = [0xe0, 0xa9, 0x2b];   // amber, matching the default note colour
const INK = [0x3f, 0x2e, 0x08];  // the "written lines" on the note

// --------------------------------------------------------------------- PNG

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ drawing

function roundedRectAlpha(x, y, left, top, right, bottom, radius) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const qx = Math.abs(x - cx) - (right - left) / 2 + radius;
  const qy = Math.abs(y - cy) - (bottom - top) / 2 + radius;
  const d =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius;
  return Math.min(Math.max(0.5 - d, 0), 1);
}

function blend(buf, i, rgb, alpha) {
  const dstA = buf[i + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    buf[i + c] = Math.round((rgb[c] * alpha + buf[i + c] * dstA * (1 - alpha)) / outA);
  }
  buf[i + 3] = Math.round(outA * 255);
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = size * 0.09;
  const radius = size * 0.22;

  // Small sizes cannot carry the written lines legibly, so they stay a solid
  // rounded tile — a recognisable shape beats an illegible drawing.
  const withLines = size >= 32;
  const lines = [0.34, 0.52, 0.70].map((t, index) => ({
    top: size * t,
    height: Math.max(1, size * 0.075),
    left: size * 0.26,
    right: size * (index === 2 ? 0.58 : 0.74),
  }));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * size + x) * 4;

      const a = roundedRectAlpha(px, py, pad, pad, size - pad, size - pad, radius);
      if (a > 0) blend(buf, i, BG, a);

      if (!withLines) continue;
      for (const line of lines) {
        const la = roundedRectAlpha(
          px, py, line.left, line.top, line.right, line.top + line.height,
          line.height / 2,
        );
        if (la > 0) blend(buf, i, INK, la * 0.82 * a);
      }
    }
  }
  return buf;
}

// --------------------------------------------------------------------- ICO

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size; // 0 means 256
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry[2] = 0; // palette size
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4);   // colour planes
    entry.writeUInt16LE(32, 6);  // bits per pixel
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const images = SIZES.map((size) => ({ size, png: encodePng(size, draw(size)) }));
const out = path.join(__dirname, '..', 'build', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildIco(images));
console.log(`Wrote ${out} (${SIZES.join(', ')} px)`);
