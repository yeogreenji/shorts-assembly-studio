import { memo, useMemo } from 'react';
import type { TemplateId } from '../types';
import { buildScene, type Motif } from '../lib/scenes';

/** 컷 배경 일러스트. seed·소품이 같으면 같은 그림이 그려집니다. */
function SceneArtBase({
  seed,
  uid,
  template,
  motif,
  index,
  className,
  style,
}: {
  seed: number;
  uid: string;
  template: TemplateId;
  motif: Motif;
  index: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const svg = useMemo(() => buildScene({ seed, uid, template, motif, index }), [seed, uid, template, motif, index]);
  return (
    <div
      aria-hidden="true"
      className={`scene-art absolute inset-0 ${className ?? ''}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export const SceneArt = memo(SceneArtBase);
