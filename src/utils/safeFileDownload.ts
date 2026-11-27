export function isHtmlPayload(payload: string, contentType?: string | null): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
    return true;
  }
  const head = (payload || '').trimStart().slice(0, 512).toLowerCase();
  if (!head) return false;
  return (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.startsWith('<body') ||
    /^<(?:!doctype\s+html|html)\b/i.test(head)
  );
}

export function resolveOutputMimeType(fileName: string): string {
  const lower = (fileName || '').trim().toLowerCase();
  if (/\.(txt|srt|vtt|csv|md|log)$/i.test(lower)) return 'text/plain; charset=utf-8';
  if (/\.json$/i.test(lower)) return 'application/json; charset=utf-8';
  if (/\.mp4$/i.test(lower)) return 'video/mp4';
  if (/\.webm$/i.test(lower)) return 'video/webm';
  if (/\.mov$/i.test(lower)) return 'video/quicktime';
  if (/\.mp3$/i.test(lower)) return 'audio/mpeg';
  if (/\.wav$/i.test(lower)) return 'audio/wav';
  if (/\.zip$/i.test(lower)) return 'application/zip';
  return 'application/octet-stream';
}

export function ensureExpectedExtension(fileName: string, expectedExt: string): string {
  const cleanName = (fileName || 'output').trim() || 'output';
  const ext = expectedExt.startsWith('.') ? expectedExt : `.${expectedExt}`;
  if (cleanName.toLowerCase().endsWith(ext.toLowerCase())) {
    return cleanName;
  }
  const replaced = cleanName.replace(/\.(html?|txt|srt|vtt|json|mp4|webm|mov|mp3|wav|zip|py)$/i, ext);
  if (replaced !== cleanName) {
    return replaced;
  }
  return `${cleanName}${ext}`;
}

export function downloadTextAsPlainFile(text: string, fileName: string): void {
  if (typeof document === 'undefined') return;
  const safeName = fileName.trim() || 'output.txt';
  const mime = resolveOutputMimeType(safeName);
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadServerOutputFile(
  relativePath: string,
  fileName?: string,
): Promise<{ ok: boolean; fileName: string; error?: string }> {
  const fallbackName = relativePath.split('/').pop() || 'output';
  const targetName = (fileName || fallbackName).trim() || fallbackName;
  try {
    const res = await fetch(`/api/output/download?path=${encodeURIComponent(relativePath)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        ok: false,
        fileName: targetName,
        error: `Không tải được ${targetName} (HTTP ${res.status}).`,
      };
    }
    const contentType = res.headers.get('content-type') || '';
    const isTextLike = /\.(txt|srt|vtt|json|csv|md|log)$/i.test(targetName);

    if (isTextLike) {
      const text = await res.text();
      if (isHtmlPayload(text, contentType)) {
        return {
          ok: false,
          fileName: targetName,
          error: `Server trả về HTML thay vì nội dung file ${targetName}.`,
        };
      }
      downloadTextAsPlainFile(text, targetName);
      return { ok: true, fileName: targetName };
    }

    if (contentType.toLowerCase().includes('text/html')) {
      return {
        ok: false,
        fileName: targetName,
        error: `Server trả về HTML thay vì file ${targetName}.`,
      };
    }

    const blob = await res.blob();
    const typedBlob = new Blob([blob], { type: resolveOutputMimeType(targetName) });
    const url = URL.createObjectURL(typedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { ok: true, fileName: targetName };
  } catch (err) {
    return {
      ok: false,
      fileName: targetName,
      error: err instanceof Error ? err.message : `Lỗi tải file ${targetName}.`,
    };
  }
}
