const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZipArchive(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let entryCount = 0;

  for (const [rawName, rawContent] of Object.entries(files)) {
    const nameBytes = encoder.encode(rawName);
    const dataBytes =
      typeof rawContent === 'string' ? encoder.encode(rawContent) : rawContent;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0x5421, true); // Mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cv.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x5421, true); // Mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
    entryCount += 1;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central directory signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Start disk
  ev.setUint16(8, entryCount, true);
  ev.setUint16(10, entryCount, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // Comment length

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

async function inflateDeflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    await writer.write(new Uint8Array(compressed));
    await writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    const merged = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      merged.set(c, pos);
      pos += c.length;
    }
    return merged;
  }

  // Fallback for Node runtimes without Web DecompressionStream
  const nodeProcess = (globalThis as {
    process?: {
      versions?: { node?: string };
      getBuiltinModule?: (id: string) => { inflateRawSync: (buf: Uint8Array) => Uint8Array } | undefined;
    };
  }).process;
  if (nodeProcess?.versions?.node && typeof nodeProcess.getBuiltinModule === 'function') {
    const zlib = nodeProcess.getBuiltinModule('node:zlib');
    if (zlib) {
      return new Uint8Array(zlib.inflateRawSync(compressed));
    }
  }
  throw new Error('Trình duyệt không hỗ trợ giải nén DEFLATE từ file .zip.');
}

export async function extractFilesFromZipArchive(
  bytes: Uint8Array,
): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  if (bytes.length < 22) return result;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');

  // Locate End of Central Directory (EOCD) scanning backward from end
  const minOffset = Math.max(0, bytes.length - 65557);
  let eocdPos = -1;
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  const readEntryAtLocalHeader = async (
    localOffset: number,
    fallbackCompressedSize?: number,
    fallbackMethod?: number,
  ): Promise<{ name: string; data: Uint8Array } | null> => {
    if (localOffset + 30 > bytes.length) return null;
    if (view.getUint32(localOffset, true) !== 0x04034b50) return null;
    const method = fallbackMethod ?? view.getUint16(localOffset + 8, true);
    const localCompSize = view.getUint32(localOffset + 18, true);
    const compSize = localCompSize > 0 ? localCompSize : fallbackCompressedSize ?? 0;
    const nameLen = view.getUint16(localOffset + 26, true);
    const extraLen = view.getUint16(localOffset + 28, true);
    const nameStart = localOffset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (dataStart + compSize > bytes.length) return null;

    const rawName = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    if (!rawName || rawName.endsWith('/') || rawName.startsWith('__MACOSX/')) {
      return null;
    }

    const slice = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      return { name: rawName, data: new Uint8Array(slice) };
    }
    if (method === 8) {
      const inflated = await inflateDeflateRaw(slice);
      return { name: rawName, data: inflated };
    }
    throw new Error(`Không hỗ trợ thuật toán nén ZIP method=${method} cho tệp ${rawName}`);
  };

  if (eocdPos >= 0) {
    const totalEntries = view.getUint16(eocdPos + 10, true);
    const centralOffset = view.getUint32(eocdPos + 16, true);
    let cursor = centralOffset;
    for (let i = 0; i < totalEntries && cursor + 46 <= bytes.length; i++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const method = view.getUint16(cursor + 10, true);
      const compSize = view.getUint32(cursor + 20, true);
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const localHeaderOffset = view.getUint32(cursor + 42, true);
      const entry = await readEntryAtLocalHeader(localHeaderOffset, compSize, method);
      if (entry) {
        result[entry.name] = entry.data;
      }
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    return result;
  }

  // Sequential local-header scan fallback
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const entry = await readEntryAtLocalHeader(offset);
    if (entry) {
      result[entry.name] = entry.data;
    }
    offset += 30 + nameLen + extraLen + compSize;
  }

  return result;
}

