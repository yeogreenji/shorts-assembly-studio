import { useRef } from 'react';
import type { BrandCorner, CaptionPosition, CaptionSize, CaptionTheme } from '../types';
import type { Studio } from '../hooks/useShorts';
import { addLogoImage, getImageDataUrl, removeImage } from '../lib/customArt';
import { Icon } from './Icon';

const THEMES: { id: CaptionTheme; label: string; hint: string }[] = [
  { id: 'impact', label: '임팩트', hint: '굵은 외곽선 + 강조색 — 숏폼 기본' },
  { id: 'bubble', label: '말풍선', hint: '대화체 썰에 어울리는 둥근 판' },
  { id: 'neon', label: '네온', hint: '발광하는 자막 — 밤·이슈' },
  { id: 'minimal', label: '미니멀', hint: '얇고 차분한 자막 — 리뷰·브이로그' },
];

const POSITIONS: { id: CaptionPosition; label: string }[] = [
  { id: 'top', label: '위' },
  { id: 'middle', label: '가운데' },
  { id: 'bottom', label: '아래' },
];

const SIZES: { id: CaptionSize; label: string }[] = [
  { id: 's', label: '작게' },
  { id: 'm', label: '보통' },
  { id: 'l', label: '크게' },
];

const CORNERS: { id: BrandCorner; label: string }[] = [
  { id: 'top-left', label: '왼쪽 위' },
  { id: 'top-right', label: '오른쪽 위' },
  { id: 'bottom-left', label: '왼쪽 아래' },
  { id: 'bottom-right', label: '오른쪽 아래' },
];

/** 인스펙터 2 — 자막 스타일과 브랜드 워터마크. */
export function CaptionBrandPanel({ studio }: { studio: Studio }) {
  const { shorts, setStyle, setBrand, notify } = studio;
  const style = shorts.style;
  const brand = shorts.brand;
  const logoInput = useRef<HTMLInputElement>(null);
  const logoUrl = getImageDataUrl(brand.logoId);

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await addLogoImage(file);
      setBrand({ logoId: result.image.id, enabled: true });
      notify(result.stored ? '로고를 워터마크에 넣었습니다.' : '로고를 넣었습니다(이번 세션에서만 유지).', result.stored ? 'info' : 'warn');
    } catch (error) {
      notify(error instanceof Error ? error.message : '로고를 넣지 못했습니다.', 'warn');
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-200">
            <Icon name="file" size={12} className="text-mist-500" />
            자막 스타일
          </h3>
          <span className="max-w-[60%] truncate text-[10px] text-mist-600">
            {THEMES.find((item) => item.id === style.theme)?.hint}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {THEMES.map((item) => {
            const active = style.theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`caption-theme-${item.id}`}
                aria-pressed={active}
                onClick={() => setStyle({ theme: item.id })}
                className={`rounded-[7px] border px-1 py-1.5 text-[10px] font-medium transition ${
                  active
                    ? 'border-mist-500/60 bg-ink-750 text-mist-100'
                    : 'border-line-soft bg-ink-900 text-mist-400 hover:border-line-strong'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-1.5 grid gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-[10px] text-mist-500">위치</span>
            <div className="seg flex-1" role="group" aria-label="자막 위치">
              {POSITIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`caption-pos-${item.id}`}
                  aria-pressed={style.position === item.id}
                  data-active={style.position === item.id}
                  onClick={() => setStyle({ position: item.id })}
                  className="seg-item"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-[10px] text-mist-500">크기</span>
            <div className="seg flex-1" role="group" aria-label="자막 크기">
              {SIZES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`caption-size-${item.id}`}
                  aria-pressed={style.size === item.id}
                  data-active={style.size === item.id}
                  onClick={() => setStyle({ size: item.id })}
                  className="seg-item"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line-soft pt-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-200">
            <Icon name="image" size={12} className="text-mist-500" />
            브랜드 워터마크
          </h3>
          <button
            type="button"
            data-testid="brand-toggle"
            aria-pressed={brand.enabled}
            onClick={() => setBrand({ enabled: !brand.enabled })}
            className={`btn h-6 border px-2 text-[10px] font-semibold ${
              brand.enabled ? 'border-mint-500/45 bg-mint-500/10 text-mint-300' : 'border-line bg-ink-900 text-mist-500'
            }`}
          >
            {brand.enabled ? '켜짐' : '꺼짐'}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex h-8 flex-1 items-center rounded-[7px] border border-line bg-ink-950 px-2">
            <span className="text-[11px] text-mist-600">@</span>
            <input
              data-testid="brand-handle"
              value={brand.handle}
              onChange={(event) => setBrand({ handle: event.target.value.replace(/^@+/, '').slice(0, 24) })}
              onFocus={() => {
                if (!brand.enabled) setBrand({ enabled: true });
              }}
              placeholder="my_channel"
              maxLength={24}
              aria-label="채널 핸들"
              className="w-full bg-transparent px-1 py-1 text-[11px] text-mist-100 outline-none placeholder:text-mist-600"
            />
          </div>
          <button
            type="button"
            data-testid="brand-logo-upload"
            onClick={() => logoInput.current?.click()}
            className="btn btn-ghost h-8 gap-1 px-2 text-[10px]"
          >
            <Icon name="upload" size={11} />
            {logoUrl ? '교체' : '로고'}
          </button>
          {logoUrl ? (
            <button
              type="button"
              onClick={() => {
                if (brand.logoId) removeImage(brand.logoId);
                setBrand({ logoId: undefined });
              }}
              className="btn btn-quiet h-8 w-8"
              aria-label="로고 지우기"
            >
              <Icon name="close" size={11} />
            </button>
          ) : null}
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void uploadLogo(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        {logoUrl ? <img src={logoUrl} alt="로고 미리보기" className="mt-2 h-7 w-7 rounded-full object-cover" /> : null}

        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="w-8 shrink-0 text-[10px] text-mist-500">자리</span>
          <div className="grid flex-1 grid-cols-4 gap-1">
            {CORNERS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`brand-corner-${item.id}`}
                aria-pressed={brand.corner === item.id}
                onClick={() => setBrand({ corner: item.id })}
                className={`rounded-[6px] border px-1 py-1 text-[9px] font-medium transition ${
                  brand.corner === item.id
                    ? 'border-mist-500/60 bg-ink-750 text-mist-100'
                    : 'border-line-soft bg-ink-900 text-mist-400 hover:border-line-strong'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-mist-600">
          핸들·로고 모두 캔버스에 구워져 저장한 영상에도 남습니다. Free 플랜의 플랫폼 표식과는 별개입니다.
        </p>
      </section>
    </div>
  );
}
