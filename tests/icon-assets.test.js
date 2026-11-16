const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inflateSync } = require('node:zlib');

const root = path.join(__dirname, '..');

function hasTransparentPixel(png, width, height) {
  let offset = 8;
  const imageData = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') imageData.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }

  const raw = inflateSync(Buffer.concat(imageData));
  const stride = width * 4;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    const filter = raw[rowOffset];
    const row = Buffer.from(raw.subarray(rowOffset + 1, rowOffset + stride + 1));
    for (let index = 0; index < stride; index += 1) {
      const left = index >= 4 ? row[index - 4] : 0;
      const up = previous[index];
      const upperLeft = index >= 4 ? previous[index - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const base = left + up - upperLeft;
        const leftDistance = Math.abs(base - left);
        const upDistance = Math.abs(base - up);
        const diagonalDistance = Math.abs(base - upperLeft);
        predictor = leftDistance <= upDistance && leftDistance <= diagonalDistance
          ? left
          : upDistance <= diagonalDistance ? up : upperLeft;
      } else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      row[index] = (row[index] + predictor) & 0xff;
    }
    for (let alpha = 3; alpha < stride; alpha += 4) if (row[alpha] === 0) return true;
    previous = row;
  }
  return false;
}

test('manifest icon paths exist and declare matching toolbar/store icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.icons, manifest.action.default_icon);
  assert.deepEqual(Object.keys(manifest.icons).sort(), ['128', '16', '48']);
  for (const iconPath of Object.values(manifest.icons)) assert.equal(fs.existsSync(path.join(root, iconPath)), true, iconPath);
});

test('extension icons are square transparent PNGs at their declared dimensions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(root, iconPath));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
    assert.equal(png[24], 8, 'the icon uses 8-bit channels');
    assert.equal(png[25], 6, 'the icon keeps an RGBA alpha channel');
    assert.equal(png[28], 0, 'the PNG is not interlaced');
    assert.equal(hasTransparentPixel(png, Number(size), Number(size)), true, 'the icon background is transparent');
  }
});
