import type { Cut, Project } from '../types';
import { stripMarks } from './presets';

function pad(n: number, len = 2): string {
  return String(Math.floor(n)).padStart(len, '0');
}

/** 00:00:03,500 형식 */
export function formatSrtTime(totalSeconds: number): string {
  const ms = Math.round(totalSeconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/** 0:03 형식 (사람이 읽는 용도) */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function cutStartTimes(cuts: Cut[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const cut of cuts) {
    starts.push(acc);
    acc += cut.duration;
  }
  return starts;
}

export function totalDuration(cuts: Cut[]): number {
  return cuts.reduce((sum, cut) => sum + cut.duration, 0);
}

/** 컷별 자막을 SRT로. 자막이 비어 있으면 나레이션으로 대체합니다. */
export function buildSrt(project: Project): string {
  let acc = 0;
  const blocks: string[] = [];
  project.cuts.forEach((cut, index) => {
    const text = stripMarks(cut.subtitle.trim() || cut.narration.trim());
    const start = acc;
    const end = acc + cut.duration;
    acc = end;
    if (!text) return;
    blocks.push(
      `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}\n`,
    );
  });
  return blocks.join('\n');
}

/** 대본 TXT — 컷별 헤드라인/자막/나레이션과 타임코드 */
export function buildTranscript(project: Project): string {
  const lines: string[] = [];
  lines.push(project.title);
  if (project.topic) lines.push(`주제: ${project.topic}`);
  lines.push(`총 길이: ${totalDuration(project.cuts).toFixed(1)}초 · 컷 ${project.cuts.length}개`);
  lines.push('');
  let acc = 0;
  project.cuts.forEach((cut, index) => {
    const start = acc;
    acc += cut.duration;
    lines.push(`#${index + 1} [${start.toFixed(1)}s–${acc.toFixed(1)}s] (${cut.duration.toFixed(1)}초)`);
    if (cut.headline.trim()) lines.push(`  헤드라인: ${cut.headline.trim()}`);
    if (cut.subtitle.trim()) lines.push(`  자막: ${stripMarks(cut.subtitle.trim())}`);
    if (cut.narration.trim()) lines.push(`  나레이션: ${cut.narration.trim()}`);
    if (cut.image) lines.push(`  배경: 업로드 이미지 (${cut.image.name})`);
    if (cut.audio) lines.push(`  음성: 업로드 오디오 (${cut.audio.name})`);
    lines.push('');
  });
  return lines.join('\n');
}
