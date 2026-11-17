/** /api/image 클라이언트 + 새로고침해도 남도록 IndexedDB에 컷 그림을 보관합니다. */

export const IMAGE_ENDPOINT = '/api/image';

export async function probeImageServer(timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(IMAGE_ENDPOINT, { cache: 'no-store', signal: controller.signal });
    const payload = (await response.json()) as { ok?: boolean; image?: boolean };
    return Boolean(response.ok && payload.ok && payload.image);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 장면 묘사로 9:16 그림 한 장을 받아 Blob으로 돌려줍니다. */
export async function requestCutImage(scene: string, character: string, timeoutMs = 70_000): Promise<Blob> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(IMAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ scene, character }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as { ok?: boolean; mime?: string; data?: string; error?: { message?: string } };
    if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? `이미지 서버 오류 (${response.status})`);
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: payload.mime || 'image/png' });
  } finally {
    window.clearTimeout(timer);
  }
}

const DB = 'shortcut-studio-art';
const STORE = 'cuts';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveArt(key: string, blob: Blob): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 저장 실패는 조용히 넘어갑니다 — 이번 세션에서는 메모리로 계속 보입니다. */
  }
}

export async function loadArt(keys: string[]): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  try {
    const db = await open();
    await Promise.all(
      keys.map(
        (key) =>
          new Promise<void>((resolve) => {
            const request = db.transaction(STORE).objectStore(STORE).get(key);
            request.onsuccess = () => {
              if (request.result instanceof Blob) out[key] = request.result;
              resolve();
            };
            request.onerror = () => resolve();
          }),
      ),
    );
    db.close();
  } catch {
    /* 없으면 빈 결과 */
  }
  return out;
}
