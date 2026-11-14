import { useEffect } from 'react';

const STEPS = [
  {
    title: '① 주제 한 줄 넣기',
    body: '왼쪽 위에 밸런스 게임 주제를 적고 "자동 대본 초안 채우기"를 누르면 훅 3초 → A/B 본문 → 투표 컷까지 4컷이 나옵니다. 프리셋 칩으로 바로 시작해도 됩니다.',
  },
  {
    title: '② 컷 다듬기',
    body: '컷마다 헤드라인·자막·나레이션·길이를 고칩니다. 자막에서 *별표*로 감싼 단어는 강조색으로 뜹니다. 배경은 5가지 그라디언트 중에 고르거나 이미지를 올리면 천천히 확대되는 효과가 붙습니다.',
  },
  {
    title: '③ 목소리·자막·BGM 맞추기',
    body: '가운데에서 MP4에 들어갈 AI 보이스(선희·인준·현수)를 고르고 [샘플 AI 보이스 생성]으로 바로 들어 봅니다. 자막 위치·크기·강조색, 상단 주제 배너 문구, BGM 분위기와 볼륨도 여기서 맞춥니다.',
  },
  {
    title: '④ 미리보기로 리듬 확인',
    body: '오른쪽 9:16 화면이 실제 결과물입니다. 재생하면 컷이 넘어가며 자막이 뜨고, 진행 바를 눌러 구간을 옮길 수 있습니다. 소리 버튼으로 나레이션·BGM을 같이 들어 보세요.',
  },
  {
    title: '⑤ 내보내기',
    body: 'SRT 자막·대본 TXT·렌더 JSON·썸네일 PNG는 버튼 한 번으로 저장됩니다. MP4는 터미널에서 npm run render-server를 켠 뒤 "MP4 만들기"를 누르거나, JSON을 내려받아 python3 scripts/render_shorts.py로 조립합니다.',
  },
];

export function GuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel max-h-[86vh] w-full max-w-xl overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="사용법"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">숏컷 스튜디오 사용법</h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              3초 훅부터 MP4 조립까지, 한 화면에서 끝내는 쇼츠 제작 흐름
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:text-white"
          >
            닫기
          </button>
        </div>

        <ol className="space-y-3">
          {STEPS.map((step) => (
            <li key={step.title} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[12px] font-semibold text-brand-200">{step.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3">
          <p className="text-[11px] font-semibold text-zinc-300">MP4를 처음 만든다면</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/70 p-2 text-[10px] leading-relaxed text-zinc-400">
{`# 1) FFmpeg + 한국어 AI 목소리 설치 (맥)
brew install ffmpeg
pip install edge-tts        # MP4에 들어갈 AI 나레이션 (인터넷 필요)

# 2) 프로젝트 폴더에서
npm install
npm run dev            # 스튜디오 열기 (http://localhost:5173)
npm run render-server  # 다른 터미널에서 켜두기

# 3) 화면에서 [🎬 MP4 만들기] 또는 명령어로
python3 scripts/render_shorts.py my.json -o out.mp4`}
          </pre>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
          MP4에는 ②단계에서 고른 AI 보이스가 자동으로 들어갑니다. 컷 카드에 🎙 녹음이나 ♪ 오디오 파일이 있으면
          그 컷은 녹음이 우선합니다. 배너·자막·하단 진행바도 미리보기 그대로 구워집니다.
        </p>
      </div>
    </div>
  );
}
