# 🎬 숏컷 스튜디오 (ShortCut Studio)

**주제 한 줄만 넣으면, 화면에서 바로 움직이는 6컷 쇼츠가 나옵니다.**

훅 → 포인트 → 투표까지 6컷(약 17.8초)을 조립하고, 9:16 플레이어에서 **실제로 컷이 넘어가고 한국어 음성으로 읽히는** 것을 보면서
자막을 그 자리에서 고치고, 대본·자막(.srt)·컷별 가이드로 바로 꺼냅니다.
서버 렌더링이나 FFmpeg 없이 브라우저에서 끝나고, AI 키가 없어도 내장 엔진으로 즉시 동작합니다.

![스튜디오 화면](docs/screenshots/01-studio.png)

---

## 1. 이번 개편에서 바꾼 것

| 이전 (v1·v2) | 지금 (v3) |
| --- | --- |
| 대본·소스 / 음성·스타일 / 미리보기 3개 패널 + 탭 전환, 패널마다 수십 개 설정 | **한 화면**: 주제 입력 → 템플릿 → 톤 → 버튼 하나, 옆에 움직이는 플레이어 |
| 미리보기가 정지 화면에 가까워 "움직이지 않는다"는 지적 | 재생하면 **6컷이 실제로 넘어가고**, 컷마다 카메라 무빙·자막 팝·한국어 음성 |
| MP4를 만들려면 로컬 렌더 서버(FFmpeg·edge-tts) 필요 | **서버 없이** 브라우저에서 대본·자막·가이드 완결 |
| 항목이 많아 "뭘 찾아야 할지 모르겠다" | 설정은 목적별 4개 템플릿·3개 톤으로만. 세부 조정은 컷 자막 한 줄뿐 |

## 2. 1분 사용법

1. **주제**를 한 줄 적습니다. 예: `월급 1.5배 vs 칼퇴`
2. **템플릿**(직장인 밸런스 · 자취 꿀팁 · 연애 썰 · IT 트렌드)과 **톤**(사이다 · 공감 · 유머)을 고릅니다.
3. **🎬 6컷 쇼츠 만들기** — 대본이 나오고 플레이어가 바로 재생됩니다.
4. 필요하면 아래 **컷 다듬기**에서 자막 한 줄을 고치거나 `←` `→`로 순서를 바꿉니다.
5. **대본 복사 / 자막 .srt / 컷별 가이드**로 꺼냅니다.

- 자막에서 `*단어*`처럼 별표로 감싸면 그 단어만 강조색으로 뜨고, 음성에서는 별표를 빼고 읽습니다.
- 만든 대본은 브라우저(`localStorage`)에 자동 저장되어 다음에 열면 그대로 이어집니다.
- 재생 중 컷이 바뀔 때마다 브라우저 음성(ko-KR)이 자막을 읽습니다. 🔊 버튼으로 끌 수 있습니다.

| 모바일 (390px) | AI 대본 모드 |
| --- | --- |
| ![모바일](docs/screenshots/02-mobile.png) | ![AI](docs/screenshots/03-ai.png) |

## 3. AI 대본 백엔드 (`api/generate.ts`)

- Vercel Serverless Function 하나로 동작합니다: `GET /api/generate`(준비 상태), `POST /api/generate`(`{ topic, template, tone }` → 6컷 JSON).
- 키 우선순위: `GEMINI_API_KEY` → `OPENAI_API_KEY` → 요청 본문의 개인 키(앞자리로 제공자 판별).
  - 기본 모델: Gemini `gemini-3.5-flash-lite` / OpenAI `gpt-4o-mini` (`GEMINI_MODEL`, `OPENAI_MODEL`로 변경 가능)
  - Gemini는 `responseMimeType: application/json`으로 같은 구조의 JSON을 받습니다. `AQ.`·`AIza…` 키 모두 지원합니다.
- **키가 없거나 서버에 닿지 않으면** 앱은 자동으로 내장 엔진(`src/lib/localEngine.ts`)으로 대본을 만듭니다.
  화면 왼쪽 배지가 `AI 대본 연결됨` / `내장 대본 엔진 사용 중` 중 무엇인지 알려 줍니다.
- 프롬프트에는 "확인되지 않은 수치·효능·1위 주장 금지", "실존 인물·회사·브랜드·실제 사건 이름 금지"가 들어 있고,
  서버가 6컷·자막 길이·별표 짝을 한 번 더 검증한 뒤 내려 줍니다. 형식이 어긋나면 502로 돌려보내 앱이 내장 엔진으로 폴백합니다.
- 입력과 키는 저장하지 않습니다.

### 키 설정

```bash
# Vercel → Project → Settings → Environment Variables
GEMINI_API_KEY=AQ....      # 또는 OPENAI_API_KEY=sk-...
# 선택
GEMINI_MODEL=gemini-3.5-flash-lite
```

```bash
npx vercel        # 첫 배포
npx vercel --prod # 운영 배포
```

`vercel.json`에 `api/generate.ts` 함수(60초·1024MB)와 `dist` 출력이 지정되어 있습니다.
GitHub Pages처럼 정적 호스팅만 쓰면 서버가 없으므로 내장 엔진으로 동작합니다(빌드는 동일).

## 4. 로컬 실행·검증

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + vite build
npm run typecheck # 앱 + api 함수 타입 검사
npm run test:e2e  # Playwright 65개 체크 (정적/AI/키없음 3가지 모드)
```

E2E는 `scripts/e2e-server.mjs`로 세 가지 서버를 띄웁니다.
`offline`(정적 파일만) · `ai`(Gemini 응답 스텁) · `nokey`(501 no_key) —
컷 전환·음성 호출(ko-KR)·자막 수정·순서 변경·클립보드·SRT 다운로드·모바일 390px 넘침·콘솔 에러를 확인합니다.

## 5. 구성

```
api/generate.ts          AI 대본 Serverless Function (Gemini·OpenAI, 형식 검증)
src/App.tsx              한 화면 구성 (입력 · 플레이어 · 컷 다듬기)
src/components/
  TopicPanel.tsx         주제 입력 · 템플릿 4종 · 톤 3종 · 만들기 버튼
  ShortsPlayer.tsx       9:16 플레이어 (컷 전환 · 카메라 무빙 · 자막 팝 · TTS)
  ShotStrip.tsx          컷별 자막 수정 · 순서 변경
  ExportBar.tsx          대본 복사 · .srt · 컷별 가이드 저장
src/lib/
  templates.ts           템플릿·팔레트·카메라 무빙
  localEngine.ts         내장 대본 엔진 (템플릿별 문장 은행 + 폴백)
  ai.ts                  서버 상태 확인 · AI 대본 요청
  srt.ts                 SRT · 대본 · 컷별 가이드 만들기
  tts.ts                 브라우저 한국어 음성
  storage.ts             자동 저장
```

## 6. 참고

- 등장하는 상황·문장은 모두 가상의 예시입니다. 실존 인물·회사·사건과 무관합니다.
- 음성은 브라우저가 제공하는 음성 합성을 씁니다(설치·전송 없음). 브라우저에 한국어 음성이 없으면 자막만 재생됩니다.
- 영상 파일(MP4)은 만들지 않습니다. 이 앱은 **촬영 전 대본·자막·연출 가이드**를 만드는 도구이고,
  세로 9:16 화면·자막·음성은 브라우저 안에서 그대로 확인할 수 있습니다.

## 컷 그림 (웹툰풍 AI 이미지)

`GEMINI_API_KEY`가 설정된 Vercel 배포에서는 AI 대본이 컷마다 영어 장면 묘사(`scene`)와 공통 주인공(`character`)을 함께 만들고,
`/api/image`가 컷마다 9:16 웹툰풍 일러스트를 그립니다(기본 모델 `gemini-3.1-flash-image`, `GEMINI_IMAGE_MODEL`로 변경, 404면 `gemini-2.5-flash-image`로 재시도).
그림은 재생 중 천천히 줌·이동하며 자막이 위에 얹힙니다. 이미지 모델은 결제가 연결된 키가 필요할 수 있습니다.
키가 없거나 실패한 컷은 내장 SVG 장면 일러스트로 대신 보여 줍니다. 컷의 🎲 버튼은 그 컷 그림을 다시 그립니다.
