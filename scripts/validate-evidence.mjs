/**
 * Validate the required cloud visual-evidence files without image libraries.
 * A non-empty file is insufficient: truncated logs or an HTML error page can
 * otherwise be uploaded with a `.png` suffix and satisfy the workflow.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? process.env.OUT_DIR ?? '.');
const desktop = { width: 1280, height: 720 };
const mobile = { width: 390, height: 844 };
const requiredEvidence = new Map([
  ['street-crossroads-desktop.png', desktop],
  ['street-cinema-facade-desktop.png', desktop],
  ['street-crossroads-mobile.png', mobile],
  ['cinema-hall-wide-desktop.png', desktop],
  ['cinema-highest-row-desktop.png', desktop],
  ['arena-desktop.png', desktop],
  ['arena-stage-close-desktop.png', desktop],
  ['party-hall-wide-desktop.png', desktop],
  ['party-hall-desktop.png', desktop],
]);

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const failures = [];

for (const [fileName, expected] of requiredEvidence) {
  const filePath = join(outputDirectory, fileName);
  try {
    const bytes = readFileSync(filePath);
    if (bytes.length < 33) throw new Error(`truncated file (${bytes.length} bytes)`);
    if (!bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
      throw new Error('invalid PNG signature');
    }
    if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('missing canonical 13-byte IHDR as the first PNG chunk');
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width !== expected.width || height !== expected.height) {
      throw new Error(`wrong IHDR dimensions ${width}x${height}; expected ${expected.width}x${expected.height}`);
    }

    let offset = pngSignature.length;
    let chunkIndex = 0;
    let sawIdat = false;
    let sawIend = false;
    while (offset < bytes.length) {
      if (bytes.length - offset < 12) {
        throw new Error(`truncated PNG chunk header/CRC at byte ${offset}`);
      }
      const dataLength = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      const chunkEnd = offset + 12 + dataLength;
      if (chunkEnd > bytes.length) {
        throw new Error(`truncated ${type || 'unknown'} chunk at byte ${offset}`);
      }
      if (chunkIndex === 0 && (type !== 'IHDR' || dataLength !== 13)) {
        throw new Error('first PNG chunk must be a 13-byte IHDR');
      }
      if (chunkIndex > 0 && type === 'IHDR') {
        throw new Error('duplicate IHDR chunk');
      }
      if (type === 'IDAT' && dataLength > 0) sawIdat = true;
      if (type === 'IEND') {
        if (dataLength !== 0) throw new Error('IEND chunk must be empty');
        sawIend = true;
        if (chunkEnd !== bytes.length) {
          throw new Error(`${bytes.length - chunkEnd} trailing byte(s) after IEND`);
        }
      }
      offset = chunkEnd;
      chunkIndex++;
      if (sawIend) break;
    }
    if (!sawIdat) throw new Error('missing non-empty IDAT image data');
    if (!sawIend) throw new Error('missing final IEND chunk');
    console.log(`✓ ${fileName}: PNG ${width}x${height}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    failures.push(`${fileName}: ${reason}`);
    console.error(`✗ ${fileName}: ${reason}`);
  }
}

if (failures.length > 0) {
  console.error(`Visual evidence validation failed for ${failures.length} file(s).`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${requiredEvidence.size} required visual-evidence PNG files.`);
}
