import type { CharacterSpec, ExpressionId } from './scene';
import { mix, rgba, shade } from './color';

/**
 * 웹툰풍 인물 한 명을 캔버스에 그립니다.
 * 좌표계는 머리 중심이 (0,0), 머리 반지름 약 112 — 배율은 호출한 쪽이 정합니다.
 * 숨쉬기·눈깜빡임·고개 흔들림·손동작이 시간에 따라 계속 움직입니다.
 */

const INK = '#161018';

function eyeOpenFor(expression: ExpressionId): number {
  switch (expression) {
    case 'shock':
      return 1.22;
    case 'tired':
      return 0.52;
    case 'smile':
    case 'smug':
      return 0.86;
    case 'smirk':
      return 0.7;
    case 'angry':
      return 0.72;
    case 'sad':
      return 0.78;
    case 'dizzy':
      return 0.9;
    default:
      return 0.95;
  }
}

function blinkAmount(t: number, phase: number): number {
  const cycle = 3.8;
  const at = (t * 0.9 + phase) % cycle;
  const span = 0.17;
  if (at > span) return 0;
  return 1 - Math.abs((at / span) * 2 - 1);
}

function hairBack(ctx: CanvasRenderingContext2D, spec: CharacterSpec) {
  const { hair, hairColor } = spec;
  ctx.fillStyle = shade(hairColor, -0.12);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  if (hair === 'long' || hair === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(-120, -40);
    ctx.bezierCurveTo(-170, 90, -180, 260, -150, 380);
    ctx.bezierCurveTo(-90, 430, 90, 430, 150, 380);
    ctx.bezierCurveTo(180, 260, 170, 90, 120, -40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'bob') {
    ctx.beginPath();
    ctx.moveTo(-124, -30);
    ctx.bezierCurveTo(-150, 80, -138, 170, -112, 190);
    ctx.bezierCurveTo(-50, 206, 50, 206, 112, 190);
    ctx.bezierCurveTo(138, 170, 150, 80, 124, -30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'bun') {
    ctx.beginPath();
    ctx.arc(0, -150, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, -18, 126, 132, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hairFront(ctx: CanvasRenderingContext2D, spec: CharacterSpec, sway: number) {
  const { hair, hairColor } = spec;
  ctx.fillStyle = shade(hairColor, 0.05);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.save();
  ctx.translate(sway, 0);
  ctx.translate(0, 12);
  ctx.scale(1.04, 1.07);
  if (hair === 'short') {
    ctx.beginPath();
    ctx.moveTo(-118, -24);
    ctx.bezierCurveTo(-120, -120, -50, -152, 10, -142);
    ctx.bezierCurveTo(80, -134, 122, -96, 118, -22);
    ctx.bezierCurveTo(96, -74, 52, -96, 10, -88);
    ctx.bezierCurveTo(-36, -80, -88, -60, -118, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'bob') {
    ctx.beginPath();
    ctx.moveTo(-120, -20);
    ctx.bezierCurveTo(-124, -116, -52, -154, 0, -148);
    ctx.bezierCurveTo(58, -142, 124, -110, 120, -18);
    ctx.bezierCurveTo(104, -66, 60, -46, 0, -52);
    ctx.bezierCurveTo(-58, -46, -104, -62, -120, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'long' || hair === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(-122, -18);
    ctx.bezierCurveTo(-128, -118, -54, -156, 4, -146);
    ctx.bezierCurveTo(68, -136, 126, -104, 120, -16);
    ctx.bezierCurveTo(100, -74, 62, -60, 34, -34);
    ctx.bezierCurveTo(10, -12, -24, -46, -52, -62);
    ctx.bezierCurveTo(-84, -78, -108, -56, -122, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'bun') {
    ctx.beginPath();
    ctx.moveTo(-120, -22);
    ctx.bezierCurveTo(-118, -122, -44, -150, 8, -144);
    ctx.bezierCurveTo(76, -136, 120, -100, 118, -20);
    ctx.bezierCurveTo(92, -66, 40, -84, -6, -76);
    ctx.bezierCurveTo(-58, -68, -98, -58, -120, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // messy — 둥글게 삐져나온 앞머리
    ctx.beginPath();
    ctx.moveTo(-122, -18);
    ctx.bezierCurveTo(-116, -70, -106, -96, -80, -104);
    ctx.bezierCurveTo(-72, -124, -46, -126, -34, -110);
    ctx.bezierCurveTo(-26, -134, 0, -138, 12, -118);
    ctx.bezierCurveTo(28, -136, 54, -128, 56, -108);
    ctx.bezierCurveTo(80, -120, 106, -106, 106, -84);
    ctx.bezierCurveTo(118, -92, 122, -56, 120, -16);
    ctx.bezierCurveTo(82, -58, 24, -64, -22, -52);
    ctx.bezierCurveTo(-62, -44, -102, -52, -122, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 옆머리 — 귀 앞으로 흘러내리는 머리카락
  if (hair === 'long' || hair === 'wavy' || hair === 'bob' || hair === 'bun') {
    ctx.fillStyle = shade(hairColor, -0.06);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(96 * side, -60);
      ctx.bezierCurveTo(132 * side, 20, 126 * side, 110, 104 * side, 158);
      ctx.bezierCurveTo(96 * side, 96, 92 * side, 30, 86 * side, -30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

interface ArmTarget {
  right: [number, number];
  left: [number, number];
}

function armTargets(pose: CharacterSpec['pose'], gesture: number): ArmTarget {
  // gesture는 0~1 사이의 느린 왕복 — 손이 살짝 더 움직입니다.
  const bump = (gesture - 0.5) * 26;
  switch (pose) {
    case 'phone':
      return { right: [148, 196 + bump], left: [-186, 500] };
    case 'cup':
      return { right: [184, 316 + bump], left: [-186, 500] };
    case 'money':
      return { right: [178, 320 - bump], left: [-178, 320 + bump] };
    case 'crossed':
      return { right: [-104, 332 + bump * 0.4], left: [104, 344 - bump * 0.4] };
    case 'palms':
      return { right: [268, 348 + bump], left: [-268, 348 - bump] };
    case 'thumbsup':
      return { right: [232, 402 + bump], left: [-186, 500] };
    case 'fist':
      return { right: [168, 246 - bump], left: [-168, 246 + bump] };
    case 'hand-on-head':
      return { right: [104, -104 + bump], left: [-186, 500] };
    case 'point':
    default:
      return { right: [312, 150 - bump], left: [-186, 500] };
  }
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  spec: CharacterSpec,
  side: 1 | -1,
  target: [number, number],
) {
  const shoulder: [number, number] = [150 * side, 244];
  const [tx, ty] = target;
  const elbow: [number, number] = [(shoulder[0] + tx) / 2 + 48 * side, (shoulder[1] + ty) / 2 + 46];
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 84;
  ctx.beginPath();
  ctx.moveTo(shoulder[0], shoulder[1]);
  ctx.quadraticCurveTo(elbow[0], elbow[1], tx, ty);
  ctx.stroke();
  // 소매는 몸통보다 조금 어둡게 — 팔이 실루엣에 묻히지 않게 합니다.
  ctx.strokeStyle = shade(spec.outfit, -0.22);
  ctx.lineWidth = 68;
  ctx.beginPath();
  ctx.moveTo(shoulder[0], shoulder[1]);
  ctx.quadraticCurveTo(elbow[0], elbow[1], tx, ty);
  ctx.stroke();
  // 소매의 밝은 면
  ctx.strokeStyle = shade(spec.outfit, -0.04);
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(shoulder[0] + 12 * side, shoulder[1] - 4);
  ctx.quadraticCurveTo(elbow[0] + 10 * side, elbow[1] - 8, tx + 8 * side, ty - 8);
  ctx.stroke();
  // 손
  ctx.beginPath();
  ctx.arc(tx, ty, 36, 0, Math.PI * 2);
  ctx.fillStyle = spec.skin;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 손가락 힌트
  ctx.beginPath();
  ctx.moveTo(tx + 4 * side, ty - 18);
  ctx.lineTo(tx + 22 * side, ty - 30);
  ctx.strokeStyle = rgba('#000000', 0.18);
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawHeldProp(ctx: CanvasRenderingContext2D, spec: CharacterSpec) {
  const { pose, skin } = spec;
  if (pose === 'phone') {
    ctx.save();
    ctx.translate(152, 180);
    ctx.rotate(-0.12);
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.roundRect(-46, -78, 92, 158, 14);
    ctx.fill();
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.roundRect(-38, -68, 76, 138, 9);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.8);
    ctx.fillRect(-30, -44, 58, 8);
    ctx.fillRect(-30, -24, 42, 8);
    ctx.restore();
  } else if (pose === 'cup') {
    ctx.save();
    ctx.translate(188, 296);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-44, -62, 88, 96, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c2703a';
    ctx.beginPath();
    ctx.roundRect(-38, -54, 76, 24, 8);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(52, -18, 26, -1.3, 1.3);
    ctx.stroke();
    ctx.restore();
  } else if (pose === 'money') {
    for (const [x, y, rot] of [
      [178, 300, -0.12],
      [-178, 300, 0.16],
    ] as const) {
      ctx.save();
      ctx.translate(x, y - 40);
      ctx.rotate(rot);
      ctx.fillStyle = '#86efac';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-62, -34, 124, 68, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (pose === 'thumbsup') {
    ctx.save();
    ctx.translate(232, 396);
    ctx.strokeStyle = skin;
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.lineTo(30, -74);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, spec: CharacterSpec, t: number, speaking: boolean) {
  const { expression, phase, intensity } = spec;
  const blink = blinkAmount(t, phase);
  const open = Math.max(0.02, eyeOpenFor(expression) * (1 - blink));
  const face = spec.face;
  const eyeX = face.eyeGap;
  const eyeY = 6;
  const eyeW = 31 * face.eye;
  const eyeH = 30 * face.eye;

  const iris = mix(spec.hairColor, '#7c4a2a', 0.42);
  for (const side of [-1, 1] as const) {
    const x = eyeX * side;
    if (open < 0.18) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - eyeW, eyeY);
      ctx.quadraticCurveTo(x, eyeY + (expression === 'smile' || expression === 'smug' ? -10 : 6), x + eyeW, eyeY);
      ctx.stroke();
      continue;
    }
    ctx.save();
    ctx.translate(x, eyeY);
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeW, eyeH * open, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeW - 1, (eyeH - 1) * open, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(2, 2 + (1 - open) * 10, 17 * face.eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#161018';
    ctx.beginPath();
    ctx.arc(2, 2 + (1 - open) * 10, 8 * face.eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.92);
    ctx.beginPath();
    ctx.arc(-5, -6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // 눈썹
  const browY = -54;
  const browShape: Record<ExpressionId, number> = {
    shock: -16,
    angry: 16,
    sad: -12,
    tired: 6,
    smile: -6,
    smug: -8,
    smirk: -4,
    dizzy: 8,
    neutral: 0,
  };
  const tilt = browShape[expression] ?? 0;
  ctx.strokeStyle = shade(spec.hairColor, -0.1);
  ctx.lineWidth = 11 * face.brow;
  ctx.lineCap = 'round';
  for (const side of [-1, 1] as const) {
    const inner = expression === 'angry' ? tilt : expression === 'sad' ? -Math.abs(tilt) * 0.6 : tilt * 0.4;
    ctx.beginPath();
    ctx.moveTo(eyeX * side + 28 * side, browY + inner);
    ctx.lineTo(eyeX * side - 24 * side, browY - inner * 0.7);
    ctx.stroke();
  }

  // 코
  ctx.strokeStyle = rgba('#3d2a22', 0.55);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(2, 34);
  ctx.quadraticCurveTo(-8, 46, 4, 50);
  ctx.stroke();

  // 입
  const mouthY = 82;
  const mouthScale = spec.face.mouth;
  ctx.save();
  ctx.translate(0, mouthY);
  ctx.scale(mouthScale, mouthScale);
  ctx.translate(0, -mouthY);
  const talk = speaking ? 0.5 + 0.5 * Math.sin(t * 21 + phase * 2) : 0;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#a8414a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  if (expression === 'shock' || (speaking && talk > 0.72)) {
    ctx.beginPath();
    ctx.ellipse(0, mouthY, 16 + talk * 6, 20 + talk * 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (expression === 'smile' || expression === 'smug') {
    ctx.beginPath();
    ctx.moveTo(-30, mouthY - 6);
    ctx.quadraticCurveTo(0, mouthY + 26 + talk * 10, 30, mouthY - 6);
    ctx.stroke();
  } else if (expression === 'angry') {
    ctx.beginPath();
    ctx.moveTo(-26, mouthY + 4);
    ctx.quadraticCurveTo(0, mouthY - 10, 26, mouthY + 4);
    ctx.stroke();
  } else if (expression === 'sad') {
    ctx.beginPath();
    ctx.moveTo(-22, mouthY + 8);
    ctx.quadraticCurveTo(0, mouthY - 12, 22, mouthY + 8);
    ctx.stroke();
  } else if (expression === 'smirk') {
    ctx.beginPath();
    ctx.moveTo(-22, mouthY + 2);
    ctx.quadraticCurveTo(6, mouthY + 16, 28, mouthY - 10);
    ctx.stroke();
  } else if (expression === 'dizzy') {
    ctx.beginPath();
    ctx.moveTo(-24, mouthY);
    ctx.quadraticCurveTo(-12, mouthY - 10, 0, mouthY);
    ctx.quadraticCurveTo(12, mouthY + 10, 24, mouthY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-18, mouthY);
    ctx.quadraticCurveTo(0, mouthY + 8 + talk * 16, 18, mouthY);
    ctx.stroke();
  }

  ctx.restore();

  // 볼
  ctx.fillStyle = rgba('#ff6b6b', (face.blush + intensity * 0.08) * 1.4);
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.ellipse((eyeX + 30) * side, 52, 26, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarks(ctx: CanvasRenderingContext2D, spec: CharacterSpec, t: number) {
  const { expression, phase } = spec;
  const pulse = 0.7 + 0.3 * Math.sin(t * 6 + phase);
  if (expression === 'angry') {
    ctx.save();
    ctx.translate(-132, -96);
    ctx.rotate(0.2);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.globalAlpha = pulse;
    for (const angle of [0.5, 2.2]) {
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 20);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  if (expression === 'tired' || expression === 'dizzy') {
    ctx.save();
    ctx.translate(124, -84);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#7dd3fc';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.bezierCurveTo(18, -2, 22, 12, 0, 26);
    ctx.bezierCurveTo(-22, 12, -18, -2, 0, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  spec: CharacterSpec,
  t: number,
  speaking: boolean,
  rim?: string,
) {
  const breath = Math.sin(t * 2.1 + spec.phase);
  const sway = Math.sin(t * 0.82 + spec.phase) * 0.018;
  const gesture = 0.5 + 0.5 * Math.sin(t * 1.7 + spec.phase);
  const targets = armTargets(spec.pose, gesture);

  ctx.save();
  ctx.translate(spec.x, spec.y);
  ctx.scale(spec.scale * spec.facing, spec.scale);
  ctx.translate(0, breath * 5);
  ctx.rotate(sway);
  ctx.lineJoin = 'round';

  // 바닥 그림자
  ctx.save();
  ctx.setTransform(ctx.getTransform());
  ctx.restore();

  hairBack(ctx, spec);

  // 몸통
  ctx.beginPath();
  ctx.moveTo(-92, 176);
  ctx.lineTo(-172, 232);
  ctx.bezierCurveTo(-196, 360, -198, 520, -196, 660);
  ctx.bezierCurveTo(-194, 820, -200, 980, -206, 1100);
  ctx.lineTo(206, 1100);
  ctx.bezierCurveTo(200, 980, 194, 820, 196, 660);
  ctx.bezierCurveTo(198, 520, 196, 360, 172, 232);
  ctx.lineTo(92, 176);
  ctx.closePath();
  const bodyGradient = ctx.createLinearGradient(-240, 240, 240, 1100);
  bodyGradient.addColorStop(0, shade(spec.outfit, 0.12 + breath * 0.02));
  bodyGradient.addColorStop(1, shade(spec.outfit, -0.22));
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();

  // 재킷 앞여밈
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 5;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(46 * side, 300);
    ctx.quadraticCurveTo(70 * side, 620, 58 * side, 1090);
    ctx.stroke();
  }

  // 셔츠 깃·주머니
  ctx.beginPath();
  ctx.moveTo(-58, 190);
  ctx.lineTo(0, 300 + breath * 4);
  ctx.lineTo(58, 190);
  ctx.lineTo(30, 178);
  ctx.lineTo(0, 232);
  ctx.lineTo(-30, 178);
  ctx.closePath();
  ctx.fillStyle = shade(spec.outfit, 0.34);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 4;
  ctx.stroke();

  // 목
  ctx.fillStyle = shade(spec.skin, -0.08);
  ctx.beginPath();
  ctx.roundRect(-42, 96, 84, 96, 26);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 4;
  ctx.stroke();

  // 팔
  if (spec.pose === 'crossed') {
    // 팔짱 — 겹쳐 놓은 팔뚝 두 줄과 손
    const bob = Math.sin(t * 1.2 + spec.phase) * 3;
    for (const [y, tone] of [
      [344 + bob, -0.05],
      [300 + bob, -0.18],
    ] as const) {
      ctx.fillStyle = shade(spec.outfit, tone);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(-138, y, 276, 66, 32);
      ctx.fill();
      ctx.stroke();
    }
    for (const [x, y] of [
      [128, 326 + bob],
      [-128, 372 + bob],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fillStyle = spec.skin;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  } else {
    drawArm(ctx, spec, 1, targets.right);
    drawArm(ctx, spec, -1, targets.left);
  }
  drawHeldProp(ctx, spec);

  // 얼굴
  ctx.fillStyle = spec.skin;
  ctx.beginPath();
  ctx.moveTo(-104, -14);
  ctx.bezierCurveTo(-110, -114, -56, -138, 0, -138);
  ctx.bezierCurveTo(56, -138, 110, -114, 104, -14);
  ctx.bezierCurveTo(100, 72, 56, 130, 0, 130);
  ctx.bezierCurveTo(-56, 130, -100, 72, -104, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();

  // 귀
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.ellipse(110 * side, 6, 16, 24, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(spec.skin, -0.05);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  drawFace(ctx, spec, t, speaking);
  hairFront(ctx, spec, Math.sin(t * 1.15 + spec.phase) * 6);

  if (spec.accessory === 'glasses') {
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 7;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.roundRect(45 * side - 40, -32, 80, 66, 16);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(6, -4);
    ctx.stroke();
  } else if (spec.accessory === 'earbuds') {
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.arc(112 * side, 12, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(112 * side, 22);
      ctx.lineTo(112 * side + 8 * side, 54);
      ctx.stroke();
    }
  } else if (spec.accessory === 'cap') {
    ctx.fillStyle = '#22303f';
    ctx.beginPath();
    ctx.moveTo(-128, -54);
    ctx.bezierCurveTo(-120, -160, 120, -160, 128, -54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(40, -58, 110, 22, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 림라이트 — 한쪽 면만 밝게 훑어 입체감을 줍니다
  if (rim) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = rgba(rim, 0.34);
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-102, -78);
    ctx.bezierCurveTo(-112, -18, -106, 40, -88, 96);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-190, 258);
    ctx.bezierCurveTo(-234, 440, -246, 720, -250, 1010);
    ctx.stroke();
    ctx.restore();
  }

  drawMarks(ctx, spec, t);
  ctx.restore();
}

/** 인물 뒤에 깔리는 부드러운 조명 — 캐릭터가 배경에서 떠 보이게. */
export function drawCharacterGlow(ctx: CanvasRenderingContext2D, spec: CharacterSpec, color: string, strength = 0.4) {
  const radius = 620 * spec.scale;
  const gradient = ctx.createRadialGradient(spec.x, spec.y + 260 * spec.scale, 40, spec.x, spec.y + 260 * spec.scale, radius);
  gradient.addColorStop(0, rgba(color, strength));
  gradient.addColorStop(0.55, rgba(color, strength * 0.35));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(spec.x - radius, spec.y + 260 * spec.scale - radius, radius * 2, radius * 2);
}
