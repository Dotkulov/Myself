const ID3_MAX = 16 * 1024 * 1024;

function synchsafe(b, i) {
  return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
}
function uint32(b, i) {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}
function ascii(b, start, len) {
  let out = '';
  for (let i = start; i < start + len; i += 1) out += String.fromCharCode(b[i]);
  return out;
}
function decodeText(bytes, enc) {
  let data = bytes;
  let label = 'windows-1251';
  if (enc === 1) {
    label = 'utf-16le';
    if (data[0] === 0xfe && data[1] === 0xff) label = 'utf-16be';
    if ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff)) {
      data = data.subarray(2);
    }
  } else if (enc === 2) {
    label = 'utf-16be';
  } else if (enc === 3) {
    label = 'utf-8';
  }
  let text;
  try {
    text = new TextDecoder(label).decode(data);
  } catch (error) {
    text = new TextDecoder('utf-8').decode(data);
  }
  return text.split('\0').map((s) => s.trim()).filter(Boolean).join(', ');
}
function findEnd(bytes, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < bytes.length; i += 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
    }
    return -1;
  }
  return bytes.indexOf(0, start);
}
function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
function parsePicture(body, major) {
  const enc = body[0];
  let pos;
  if (major === 2) {
    pos = 4;
  } else {
    const mimeEnd = body.indexOf(0, 1);
    if (mimeEnd === -1) return null;
    pos = mimeEnd + 1;
  }
  const type = body[pos];
  pos += 1;
  const descEnd = findEnd(body, pos, enc);
  if (descEnd === -1) return null;
  pos = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
  const data = body.slice(pos);
  const image = sniffImage(data);
  if (!image) return null;
  return { type, data, mime: image.mime, ext: image.ext };
}

async function readId3FromUrl(url) {
  // Скачивание первые байты файла через fetch
  const response = await fetch(url, { headers: { Range: 'bytes=0-10' } });
  if (!response.ok) throw new Error('Network error');
  
  const head = new Uint8Array(await response.arrayBuffer());
  if (ascii(head, 0, 3) !== 'ID3') return {};

  const major = head[3];
  if (major < 2 || major > 4) return {};
  const size = synchsafe(head, 6);
  
  // Скачивает весь блок с тегами
  const fullResponse = await fetch(url, { headers: { Range: `bytes=10-${10 + Math.min(size, ID3_MAX)}` } });
  const buf = new Uint8Array(await fullResponse.arrayBuffer());

  let pos = 0;
  if (major > 2 && (head[5] & 0x40) && buf.length > 4) {
    pos = major === 4 ? synchsafe(buf, 0) : uint32(buf, 0) + 4;
  }

  const idLen = major === 2 ? 3 : 4;
  const hdrLen = major === 2 ? 6 : 10;
  const result = { title: '', artist: '', cover: null };
  let altArtist = '';

  while (pos + hdrLen <= buf.length) {
    if (buf[pos] === 0) break;
    const id = ascii(buf, pos, idLen);
    let fsize;
    if (major === 2) fsize = (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5];
    else if (major === 4) fsize = synchsafe(buf, pos + 4);
    else fsize = uint32(buf, pos + 4);

    const start = pos + hdrLen;
    const end = start + fsize;
    if (fsize <= 0 || end > buf.length) break;

    let body = buf.subarray(start, end);
    if (major === 4 && (buf[pos + 9] & 0x01) && body.length > 4) body = body.subarray(4);

    if (id === 'TIT2' || id === 'TT2') {
      result.title = decodeText(body.subarray(1), body[0]);
    } else if (id === 'TPE1' || id === 'TP1') {
      result.artist = decodeText(body.subarray(1), body[0]);
    } else if (id === 'TPE2' || id === 'TP2') {
      altArtist = decodeText(body.subarray(1), body[0]);
    } else if (id === 'APIC' || id === 'PIC') {
      const picture = parsePicture(body, major);
      if (picture && (!result.cover || (picture.type === 3 && result.cover.type !== 3))) {
        result.cover = picture;
      }
    }
    pos = end;
  }

  if (!result.artist) result.artist = altArtist;
  return result;
}
