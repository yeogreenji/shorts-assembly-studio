/**
 * 내 목소리 — 컷마다 직접 녹음하거나 성우·클로바더빙에서 받은 MP3/WAV를 올려 씁니다.
 *
 *  · 녹음: 마이크(MediaRecorder) → 브라우저에서 바로 디코드 → 컷에 붙임
 *  · 업로드: 오디오 파일을 디코드해 컷에 붙임(포맷은 브라우저가 아는 대로)
 *  · 붙인 길이에 맞춰 컷 길이가 자동으로 늘어나고, 미리보기·영상 저장이 같은 버퍼를 씁니다
 *  · IndexedDB에 조용히 저장해 새로고침해도 남습니다(저장 공간이 없으면 이번 세션만)
 */

export interface Take {
  shotId: string;
  buffer: AudioBuffer;
  seconds: number;
  kind: 'mic' | 'file';
  name: string;
  createdAt: number;
}

const takes = new Map<string, Take>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeTakes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function takesVersion(): number {
  return version;
}

export function getTake(shotId: string): Take | undefined {
  return takes.get(shotId);
}

export function allTakes(): Take[] {
  return [...takes.values()];
}

export function takeCount(): number {
  return takes.size;
}

export function clearTake(shotId: string): void {
  takes.delete(shotId);
  void removeStored(shotId);
  emit();
}

/** 대본이 바뀌어 사라진 컷의 녹음은 메모리에서 정리합니다(저장소는 그대로 둡니다). */
export function pruneTakes(keepIds: string[]): void {
  const keep = new Set(keepIds);
  let changed = false;
  for (const id of [...takes.keys()]) {
    if (!keep.has(id)) {
      takes.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

/* ── 디코드 ────────────────────────────────────────────── */

let decodeCtx: AudioContext | null = null;

function decoder(): AudioContext | null {
  if (decodeCtx) return decodeCtx;
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    decodeCtx = new Ctor();
  } catch {
    return null;
  }
  return decodeCtx;
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const buffer = await blob.arrayBuffer();
  const ctx = decoder();
  if (!ctx) throw new Error('이 브라우저에서는 오디오를 읽을 수 없습니다.');
  try {
    return await ctx.decodeAudioData(buffer.slice(0));
  } catch {
    throw new Error('오디오 파일을 읽지 못했습니다. MP3·WAV·M4A로 다시 시도해 주세요.');
  }
}

/* ── 붙이기 ────────────────────────────────────────────── */

export async function applyTake(shotId: string, blob: Blob, kind: 'mic' | 'file', name: string): Promise<Take> {
  const buffer = await decodeAudio(blob);
  if (buffer.duration < 0.15) throw new Error('소리가 너무 짧습니다. 0.2초 이상 녹음해 주세요.');
  const take: Take = {
    shotId,
    buffer,
    seconds: buffer.duration,
    kind,
    name,
    createdAt: Date.now(),
  };
  takes.set(shotId, take);
  void storeTake(shotId, blob, kind, name);
  emit();
  return take;
}

/* ── 녹음 ──────────────────────────────────────────────── */

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
  /** 녹음이 시작된 뒤 흐른 시간(초) */
  elapsed: () => number;
  mimeType: string;
}

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* 다음 후보 */
    }
  }
  return '';
}

/** 마이크 녹음을 시작합니다 — 권한이 없으면 사용자가 이해할 수 있는 문장으로 실패합니다. */
export async function startRecording(): Promise<Recording> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('이 브라우저에서는 마이크 녹음을 쓸 수 없습니다. 파일을 올려 주세요.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('이 브라우저는 녹음을 지원하지 않습니다. 오디오 파일을 올려 주세요.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error('마이크 권한이 필요합니다. 주소창의 마이크 허용을 켜고 다시 시도해 주세요.');
  }
  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const startedAt = performance.now();
  recorder.start(200);

  const cleanup = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    elapsed: () => (performance.now() - startedAt) / 1000,
    cancel: () => {
      try {
        recorder.stop();
      } catch {
        /* 이미 멈춤 */
      }
      cleanup();
    },
    stop: () =>
      new Promise<Blob>((resolve) => {
        const finish = () => {
          cleanup();
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
        };
        recorder.onstop = finish;
        try {
          recorder.stop();
        } catch {
          finish();
        }
      }),
  };
}

/* ── IndexedDB (조용한 보관) ───────────────────────────── */

const DB_NAME = 'shortcut-studio';
const STORE = 'takes';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'shotId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function storeTake(shotId: string, blob: Blob, kind: 'mic' | 'file', name: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ shotId, blob, kind, name, createdAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

async function removeStored(shotId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(shotId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** 새로고침 뒤 현재 컷들의 녹음을 되살립니다(있는 것만, 조용히). */
export async function hydrateTakes(shotIds: string[]): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  try {
    const records = await new Promise<{ shotId: string; blob: Blob; kind: 'mic' | 'file'; name: string; createdAt: number }[]>(
      (resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).getAll();
        request.onsuccess = () => resolve((request.result as typeof records) ?? []);
        request.onerror = () => resolve([]);
      },
    );
    const wanted = new Set(shotIds);
    let restored = 0;
    for (const record of records) {
      if (!wanted.has(record.shotId) || takes.has(record.shotId)) continue;
      try {
        const buffer = await decodeAudio(record.blob);
        takes.set(record.shotId, {
          shotId: record.shotId,
          buffer,
          seconds: buffer.duration,
          kind: record.kind,
          name: record.name,
          createdAt: record.createdAt,
        });
        restored += 1;
      } catch {
        /* 읽지 못한 녹음은 건너뜀 */
      }
    }
    if (restored) emit();
    return restored;
  } finally {
    db.close();
  }
}
