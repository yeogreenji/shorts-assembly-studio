import type { Shorts, Shot } from '../types';
import { TONE_LABEL, TEMPLATE_MAP, cameraFor, roleLabel } from './templates';
import { narrationOf, sceneNote } from './localEngine';
import { buildScenePlan } from './motion/scene';
import { stripMarks } from './text';

function pad(value: number, size = 2): string {
  return String(Math.floor(value)).padStart(size, '0');
}

/** 0:03 — 화면에 보여주는 시계 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${pad(safe % 60)}`;
}

/** 00:00:03,500 — SRT 타임코드 */
export function formatSrtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${pad(ms / 3_600_000)}:${pad((ms % 3_600_000) / 60_000)}:${pad((ms % 60_000) / 1000)},${pad(ms % 1000, 3)}`;
}

export function cutStartTimes(cuts: Shot[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const cut of cuts) {
    starts.push(acc);
    acc += cut.duration;
  }
  return starts;
}

export function totalDuration(cuts: Shot[]): number {
  return cuts.reduce((sum, cut) => sum + cut.duration, 0);
}

export function buildSrt(shorts: Shorts): string {
  let acc = 0;
  const blocks: string[] = [];
  shorts.cuts.forEach((cut, index) => {
    const text = stripMarks(cut.subtitle);
    const start = acc;
    acc += cut.duration;
    if (!text) return;
    blocks.push(`${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(acc)}\n${text}\n`);
  });
  return blocks.join('\n');
}

/** 대본 — 그대로 복사해 촬영·편집에 쓸 수 있는 형태. */
export function buildScript(shorts: Shorts): string {
  const template = TEMPLATE_MAP[shorts.template];
  const lines: string[] = [
    shorts.title,
    `주제: ${shorts.topic}`,
    `구성: ${template.label} · ${TONE_LABEL[shorts.tone]} 톤 · ${shorts.cuts.length}컷 · ${totalDuration(shorts.cuts).toFixed(1)}초`,
    '',
  ];
  const starts = cutStartTimes(shorts.cuts);
  shorts.cuts.forEach((cut, index) => {
    const start = starts[index] ?? 0;
    lines.push(`#${index + 1} [${start.toFixed(1)}s~${(start + cut.duration).toFixed(1)}s] ${roleLabel(index, shorts.cuts.length)} ${cut.emoji}`);
    lines.push(`  자막: ${stripMarks(cut.subtitle)}`);
    lines.push(`  읽기: ${narrationOf(cut)}`);
    lines.push('');
  });
  lines.push(`마지막 자막에 "${shorts.banner}" 라벨을 고정해 두면 시리즈로 묶입니다.`);
  return lines.join('\n').trim();
}

/** 컷별 가이드 — 화면에 무엇을 어떻게 올릴지. */
export function buildGuide(shorts: Shorts): string {
  const template = TEMPLATE_MAP[shorts.template];
  const starts = cutStartTimes(shorts.cuts);
  const lines: string[] = [
    `${shorts.title} — 컷별 가이드`,
    `주제: ${shorts.topic}`,
    `톤: ${TONE_LABEL[shorts.tone]} · 총 ${totalDuration(shorts.cuts).toFixed(1)}초 · 9:16 세로`,
    '',
  ];
  const plan = buildScenePlan(shorts);
  shorts.cuts.forEach((cut, index) => {
    const start = starts[index] ?? 0;
    const scene = plan.cuts[index];
    lines.push(`${index + 1}. ${roleLabel(index, shorts.cuts.length)} · ${cut.duration.toFixed(1)}초 · ${start.toFixed(1)}s 시작`);
    if (cut.visual) {
      lines.push(`   장면: ${cut.visual.scene} · ${cut.visual.subject} / ${cut.visual.expression} 표정 · ${cut.visual.action} · 소품 ${cut.visual.props.join(', ') || '없음'}`);
    }
    lines.push(`   화면: ${cut.emoji} ${scene?.label ?? sceneNote(shorts.template, index)}`);
    lines.push(`   카메라: ${cut.visual?.camera ?? cameraFor(index)} (${cameraFor(index)})`);
    lines.push(`   자막: ${stripMarks(cut.subtitle)}`);
    lines.push('');
  });
  lines.push(`업로드 팁: 첫 2초 안에 훅 자막이 떠야 이탈이 줄어듭니다. ${template.banner} 라벨을 유지하면 시리즈로 인식됩니다.`);
  return lines.join('\n');
}
