/** *강조* 표기 다루기 — 화면·자막·음성이 같은 규칙을 씁니다. */

export interface Segment {
  text: string;
  highlighted: boolean;
}

export function parseHighlight(input: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    if (match.index > last) segments.push({ text: input.slice(last, match.index), highlighted: false });
    segments.push({ text: match[1] ?? '', highlighted: true });
    last = match.index + match[0].length;
  }
  if (last < input.length) segments.push({ text: input.slice(last), highlighted: false });
  return segments.length ? segments : [{ text: input, highlighted: false }];
}

export function stripMarks(input: string): string {
  return input.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

/** 별표 짝이 맞지 않으면 홀수 번째 별표를 지웁니다(화면에 *가 남지 않게). */
export function normalizeMarks(input: string): string {
  const marks = (input.match(/\*/g) ?? []).length;
  if (marks % 2 === 0) return input;
  const index = input.lastIndexOf('*');
  return `${input.slice(0, index)}${input.slice(index + 1)}`;
}

export function clampText(input: string, max: number): string {
  const text = input.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
