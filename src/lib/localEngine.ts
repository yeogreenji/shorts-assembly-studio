import type { CutVisual, Shorts, Shot, TemplateId, Tone } from '../types';
import { DEFAULT_CUTS, TEMPLATE_MAP, defaultDurations, roleOf } from './templates';
import { clampText, stripMarks } from './text';
import { createRng, newSeed, type Rng } from './motion/rng';
import { expressionFromWords } from './motion/art';
import { BGM_BY_TEMPLATE, DEFAULT_AUDIO, DEFAULT_BRAND, DEFAULT_STYLE } from './defaults';
import { findPack, toneHook, type PackCut, type ScriptPack } from './scriptPacks';

/**
 * AI 키가 없거나 서버에 닿지 않아도 바로 쓸 수 있는 내장 대본 엔진.
 *
 *  · 추천 주제는 9~11컷 완성형 대본(scriptPacks.ts)을 그대로 씁니다 — 40~55초 분량
 *  · 직접 입력한 주제는 그 카테고리의 10컷 구조(후킹→문제→근거→반전→CTA)에 주제를 얹어 조립합니다
 *  · 컷마다 화면 자막과 나레이션 문장을 따로 두어, 자막은 짧고 음성은 자연스럽게 이어집니다
 */

/* ── 직접 입력한 주제용 10컷 구조 ───────────────────────── */

interface Line {
  s: string;
  v: string;
}

interface Scaffold {
  hook: Record<Tone, Line[]>;
  body: Line[];
  cta: Record<Tone, Line[]>;
}

const SCAFFOLDS: Record<TemplateId, Scaffold> = {
  balance: {
    hook: {
      cider: [
        { s: '*{A}* vs *{B}*, 딱 하나만', v: '{A}와 {B}, 하나만 고르라면 어느 쪽이에요?' },
        { s: '{A}? {B}? *고르는 순간* 끝', v: '{A}와 {B}, 고르는 순간 인생이 갈린다면 어느 쪽입니까?' },
      ],
      empathy: [
        { s: '이거 진짜 고민인데… *{A}*? *{B}*?', v: '{A}와 {B} 사이에서 매일 고민한다면, 솔직히 어느 쪽이에요?' },
        { s: '둘 다 싫은데 *하나만* 고르라면', v: '둘 다 마음에 안 드는데 하나만 골라야 한다면요?' },
      ],
      humor: [
        { s: '*{A}* vs *{B}*, 인생 걸고', v: '{A}와 {B}, 인생 걸고 고른다면 어느 쪽입니까?' },
        { s: '이거 고르고 *후회*하는 사람 많음', v: '{A}와 {B}, 고르고 나서 후회하는 사람을 많이 봤습니다.' },
      ],
    },
    body: [
      { s: '*{A}*, 좋은 점부터', v: '{A}의 좋은 점부터 보죠. 당장 눈에 보이는 이득이 있습니다.' },
      { s: '대신 *대가*가 따라옴', v: '대신 대가가 따라옵니다. 그 대가가 매일인지 가끔인지가 중요해요.' },
      { s: '*{B}*는 안전빵처럼 보임', v: '{B}는 안전해 보입니다. 처음엔 누구나 이쪽을 고릅니다.' },
      { s: '그런데 *공짜*는 없음', v: '그런데 공짜는 없습니다. 안전한 쪽에도 조용한 손해가 있어요.' },
      { s: '기준은 *하루*가 아니라 *3년*', v: '기준은 오늘이 아니라 3년 뒤로 잡으세요. 지금 편한 쪽이 계속 편하진 않습니다.' },
      { s: '돈은 *숫자*, 시간은 *체감*', v: '돈은 숫자로 보이지만 시간은 체감으로 남습니다. 어느 쪽이 먼저 아플지 생각해 보세요.' },
      { s: '주변에 물어보면 *반반*', v: '주변에 물어보면 반으로 갈립니다. 그 반이 각자 무엇을 포기했는지가 답이에요.' },
      { s: '결국 *내 상황*이 정답', v: '결국 정답은 내 상황입니다. 지금 가장 급한 게 무엇인지부터 정하세요.' },
    ],
    cta: {
      cider: [{ s: '댓글로 *1번*이야 *2번*이야', v: '1번인지 2번인지 댓글로 알려주세요.' }],
      empathy: [{ s: '당신은 *어느 쪽*이에요?', v: '당신은 어느 쪽을 고르셨어요? 댓글로 들려주세요.' }],
      humor: [{ s: '댓글 안 달면 *둘 다* 함', v: '댓글 안 달면 둘 다 하기로 했습니다. 각오하세요.' }],
    },
  },
  living: {
    hook: {
      cider: [
        { s: '{topic}, *이것*만 확인', v: '{topic}. 이것만 확인하면 절반은 해결됩니다.' },
        { s: '이거 모르고 *{topic}* 시작하면', v: '이걸 모르고 시작하면 손해부터 봅니다. {topic} 이야기입니다.' },
      ],
      empathy: [
        { s: '{topic}, 저도 *삽질* 많이 했어요', v: '{topic}, 저도 처음엔 많이 헤맸어요. 지금 알게 된 것부터 말할게요.' },
        { s: '{topic}, *처음*이라면 특히', v: '{topic}, 처음이라면 특히 이 부분을 보세요.' },
      ],
      humor: [
        { s: '{topic} 검색하다 *여기* 옴', v: '{topic} 검색하다가 여기까지 오셨죠? 딱 정리해 드립니다.' },
        { s: '{topic}에 *수업료* 낸 사람 여기', v: '{topic}에 수업료를 낸 사람이 여기 있습니다.' },
      ],
    },
    body: [
      { s: '먼저 *새는 곳*부터', v: '먼저 새는 곳부터 찾으세요. 대부분 고정비에서 샙니다.' },
      { s: '고정비는 *한 장*에 적기', v: '고정비는 한 장에 다 적어 보세요. 안 보이던 구독이 눈에 들어옵니다.' },
      { s: '*쓰는 양*보다 *구간*', v: '요금은 쓰는 양보다 구간이 문제입니다. 한 칸 넘으면 배로 뛰어요.' },
      { s: '사기 전에 *실측*', v: '사기 전에는 반드시 실측하세요. 크기 하나로 반품이 갈립니다.' },
      { s: '수납은 *세로*로', v: '수납은 세로로 쌓으세요. 바닥을 늘리는 것보다 두 배 쉽습니다.' },
      { s: '*한 번에* 다 바꾸지 않기', v: '한 번에 다 바꾸지 마세요. 하나 바꾸고 일주일 써 보고 다음으로 넘어가세요.' },
      { s: '관리비는 *내역서*로 확인', v: '관리비가 이상하면 내역서를 요청하세요. 말 한마디로 확인됩니다.' },
      { s: '결국 *습관*이 답', v: '결국 답은 습관입니다. 매주 한 번만 점검해도 충분해요.' },
    ],
    cta: {
      cider: [{ s: '*저장*해두면 두 번 안 찾음', v: '저장해 두면 두 번 찾지 않습니다.' }],
      empathy: [{ s: '하나씩 *해보세요*', v: '한 번에 하나씩만 해보세요. 그것만으로 달라집니다.' }],
      humor: [{ s: '저장 안 하면 *또* 검색함', v: '저장 안 하면 다음 달에 또 검색하게 됩니다.' }],
    },
  },
  love: {
    hook: {
      cider: [
        { s: '{topic}, *한 줄*이면 정리', v: '{topic}, 한 줄이면 정리됩니다.' },
        { s: '{topic}, 이 한마디가 *전부*', v: '{topic}, 이 한마디가 전부입니다.' },
      ],
      empathy: [
        { s: '{topic}, 저도 *비슷했어요*', v: '{topic}, 저도 비슷한 적이 있어서 잘 압니다.' },
        { s: '{topic}, *마음*이 복잡하지', v: '{topic}, 마음이 복잡한 게 당연해요.' },
      ],
      humor: [
        { s: '{topic}로 *밤새* 고민한 사람', v: '{topic}로 밤새 고민한 사람 여기 있습니다.' },
        { s: '{topic}에 *정답*은 없지만', v: '{topic}에 정답은 없지만, 덜 아픈 길은 있습니다.' },
      ],
    },
    body: [
      { s: '*먼저* 답하지 않기', v: '먼저 답하지 마세요. 상대가 말할 틈을 주면 대화가 길어집니다.' },
      { s: '질문은 *하나*씩', v: '질문은 하나씩만. 두 개를 한 번에 보내면 하나만 답이 옵니다.' },
      { s: '답장은 *내용*이 먼저', v: '답장은 빠르기보다 내용입니다. 질문에 답하면 늦어도 괜찮아요.' },
      { s: '서운함은 *그때* 말하기', v: '서운한 건 그때 말하세요. 쌓아 두면 한 번에 터집니다.' },
      { s: '비교는 *그 자리*에서 금지', v: '비교는 그 자리에서 금지입니다. 한 번 나오면 오래 남아요.' },
      { s: '약속은 *작게* 잡기', v: '약속은 작게 잡으세요. 두 시간이면 충분합니다.' },
      { s: '상대 속도를 *존중*', v: '상대 속도를 존중하세요. 빠른 사람이 늘 유리한 건 아닙니다.' },
      { s: '결국 *표현*이 답', v: '결국 표현이 답입니다. 말하지 않으면 알 수 없어요.' },
    ],
    cta: {
      cider: [{ s: '*저장*해두고 쓰세요', v: '저장해 두고 필요할 때 꺼내 쓰세요.' }],
      empathy: [{ s: '너무 *애쓰지* 않아도 돼요', v: '너무 애쓰지 않아도 됩니다. 편하게 한 번만 해보세요.' }],
      humor: [{ s: '이거 보고 *반성*했습니다', v: '저는 이거 보고 반성했습니다. 당신은 어떠세요?' }],
    },
  },
  review: {
    hook: {
      cider: [
        { s: '{topic}, *한 번* 써봤습니다', v: '{topic}, 한 번 써보고 솔직하게 말합니다.' },
        { s: '{topic}, 결론부터 *딱* 말하면', v: '{topic}, 결론부터 딱 말하면 이렇습니다.' },
      ],
      empathy: [
        { s: '{topic}, 사기 전에 *이거* 보세요', v: '{topic}, 사기 전에 이건 알고 가세요.' },
        { s: '{topic}, 저도 *고민* 많이 했어요', v: '{topic}, 저도 고민을 꽤 했습니다.' },
      ],
      humor: [
        { s: '{topic} 검색만 하다 *끝*난 사람', v: '{topic} 검색만 하다 끝난 사람, 이제 결론 드립니다.' },
        { s: '{topic}, *3분*이면 판단 끝', v: '{topic}, 3분이면 판단이 끝납니다.' },
      ],
    },
    body: [
      { s: '결론부터 *한 줄*', v: '결론부터 한 줄로 말하면, 값어치는 합니다.' },
      { s: '좋았던 건 *가격*과 *양*', v: '좋았던 건 가격과 양입니다. 이 조합이면 실패는 안 해요.' },
      { s: '아쉬운 건 *대기 시간*', v: '아쉬운 건 대기 시간입니다. 피크에는 30분은 기본이에요.' },
      { s: '사진과 *실물* 차이', v: '사진과 실물 차이는 거의 없습니다. 이건 칭찬입니다.' },
      { s: '*숫자*로 보면', v: '숫자로 보면 2인 3만원 선입니다. 음료까지 넣으면 조금 더 나가요.' },
      { s: '재방문은 *반반*', v: '재방문 의사는 반반입니다. 나쁘진 않은데 급하진 않아요.' },
      { s: '평일과 *주말*이 다름', v: '평일과 주말이 완전히 다릅니다. 가능하면 평일로 가세요.' },
      { s: '*누구에게* 맞는지', v: '처음 가는 사람에게는 맞고, 자주 가는 사람에게는 아닙니다.' },
    ],
    cta: {
      cider: [{ s: '저장해두면 *다음에* 씀', v: '저장해 두면 다음에 씁니다.' }],
      empathy: [{ s: '기대는 *조금만* 낮추면', v: '기대를 조금만 낮추면 만족합니다.' }],
      humor: [{ s: '웨이팅은 *운동*이라 생각하기', v: '웨이팅은 운동이라 생각하세요. 그럼 이득입니다.' }],
    },
  },
  issue: {
    hook: {
      cider: [
        { s: '{topic}, *세 줄*로 정리', v: '{topic}, 세 줄로 정리했습니다.' },
        { s: '{topic}, 놓치면 *손해*', v: '{topic}, 놓치면 조금 손해입니다.' },
      ],
      empathy: [
        { s: '{topic}, *어렵지* 않아요', v: '{topic}, 어렵게 쓰여 있어서 그렇지 않아요.' },
        { s: '{topic}, *쉽게* 정리했어요', v: '{topic}, 쉽게 정리했습니다.' },
      ],
      humor: [
        { s: '{topic} 검색만 하다 *끝*난 사람', v: '{topic} 검색만 하다 끝난 사람을 위해 준비했습니다.' },
        { s: '{topic}, *아는 척*용으로 저장', v: '{topic}, 아는 척용으로 저장해 두세요.' },
      ],
    },
    body: [
      { s: '첫째는 *무슨 일*인지', v: '첫째, 무슨 일이 있었는지부터. 보도된 내용 기준으로 말합니다.' },
      { s: '둘째는 *왜 중요한지*', v: '둘째, 왜 중요한지. 내 생활에 닿는 지점이 있으면 큰 뉴스입니다.' },
      { s: '셋째는 *누가 영향*을 받는지', v: '셋째, 누가 영향을 받는지. 결제와 보안은 대부분 해당됩니다.' },
      { s: '숫자는 *방향*만', v: '숫자는 정확한 값보다 방향만 보세요. 오르는지 멈췄는지.' },
      { s: '확인되지 않은 건 *빼기*', v: '확인되지 않은 전망은 뺐습니다. 단정하지 않는 게 안전합니다.' },
      { s: '오래된 앱일수록 *빠름*', v: '오래된 앱일수록 바뀌는 속도가 빠릅니다. 업데이트를 미루지 마세요.' },
      { s: '다음 주에 *또* 바뀜', v: '다음 주에 또 바뀝니다. 이 영상은 오늘 기준입니다.' },
      { s: '결론은 *한 줄*', v: '결론은 한 줄입니다. 필요한 것만 챙기고 나머지는 흘려보내세요.' },
    ],
    cta: {
      cider: [{ s: '*세 줄*이면 충분', v: '세 줄이면 충분합니다. 저장해 두세요.' }],
      empathy: [{ s: '필요할 때 *꺼내* 보세요', v: '필요할 때 꺼내 보세요.' }],
      humor: [{ s: '이거 보고 *아는 척* 하세요', v: '이거 보고 아는 척 하시면 됩니다.' }],
    },
  },
  it: {
    hook: {
      cider: [
        { s: '{topic}, *이 순서*면 됩니다', v: '{topic}, 이 순서만 지키면 됩니다.' },
        { s: '{topic}, *핵심*만 뽑았습니다', v: '{topic}, 핵심만 뽑았습니다.' },
      ],
      empathy: [
        { s: '{topic}, *처음*이면 특히', v: '{topic}, 처음이라면 특히 이 부분을 보세요.' },
        { s: '{topic}, *어렵지* 않아요', v: '{topic}, 어렵게 생각하면 끝이 없습니다.' },
      ],
      humor: [
        { s: '{topic} *다* 아는 척하는 법', v: '{topic}, 다 아는 척하는 법부터 알려드립니다.' },
        { s: '{topic} 검색만 하다 *끝*난 사람', v: '{topic} 검색만 하다 끝난 사람을 위해 준비했습니다.' },
      ],
    },
    body: [
      { s: '먼저 *목표*를 한 줄로', v: '먼저 목표를 한 줄로 적으세요. 그 한 줄이 기준이 됩니다.' },
      { s: '도구는 *마지막*에', v: '도구는 마지막에 고르세요. 먼저 할 일이 분명해야 합니다.' },
      { s: '첫 화면에 *하나*만', v: '첫 화면에는 하나만 두세요. 선택지가 많으면 아무것도 안 합니다.' },
      { s: '*3초* 안에 보여주기', v: '3초 안에 뭘 하는 앱인지 보여주세요. 그게 전부입니다.' },
      { s: '개인정보는 *최소*로', v: '개인정보는 최소로. 필요 없는 항목은 신뢰를 깎습니다.' },
      { s: '결과는 *내 말투*로', v: '결과는 내 말투로 고치세요. 그대로 쓰면 티가 납니다.' },
      { s: '피드백은 *한 곳*에', v: '피드백은 한 곳에 모으세요. 흩어지면 아무것도 안 고칩니다.' },
      { s: '출시 후 *수정*은 기본', v: '출시 후 수정은 기본값입니다. 완벽을 기다리면 못 냅니다.' },
    ],
    cta: {
      cider: [{ s: '*저장*해두면 바로 씀', v: '저장해 두면 바로 씁니다.' }],
      empathy: [{ s: '하나씩 *익혀보세요*', v: '하나씩 익혀 보세요. 금방 익숙해집니다.' }],
      humor: [{ s: '저장만 하고 *안* 쓰죠?', v: '저장만 하고 안 쓰시죠? 오늘 하나만 해보세요.' }],
    },
  },
};

/* ── 그림 지시 ─────────────────────────────────────────── */

const SCENE_POOL: Record<TemplateId, string[]> = {
  balance: [
    '퇴근길 지하철',
    '야근 사무실',
    '회의실',
    '엘리베이터',
    '사무실 책상',
    '노을 진 옥상',
    '동네 카페',
    '자취방 창가',
    '출근길 지하철',
    '도시의 밤',
  ],
  living: [
    '자취방 주방',
    '원룸 창가',
    '아침 주방',
    '이사 첫날 빈방',
    '장 보러 간 마트',
    '동네 카페',
    '사무실 책상',
    '불 끄기 전 자취방',
    '벚꽃 산책',
    '도시의 야경',
  ],
  love: [
    '카페 창가',
    '카페 마주 앉은',
    '라테 두 잔',
    '비 오는 골목',
    '비 오는 밤',
    '벚꽃 산책',
    '달빛 정원',
    '창가 자리의 미소',
    '도시의 밤',
    '공원 벤치',
  ],
  review: [
    '브런치 카페 창가',
    '줄 선 가게 앞',
    '주방 식탁',
    '카페 카운터',
    '동네 카페',
    '장 보러 간 마트',
    '도시의 밤거리',
    '야근 사무실',
    'AI 작업실',
    '퇴근길 지하철',
  ],
  issue: [
    '뉴스 스튜디오',
    '모니터 앞 책상',
    '사무실 책상',
    '출근길 지하철',
    '동네 카페',
    'AI 작업실',
    '장 보러 간 마트',
    '도시의 밤',
    '도시의 야경',
    '자취방 주방',
  ],
  it: [
    'AI 작업실',
    '모니터 앞 책상',
    '사무실 책상',
    '출근길 지하철',
    '회의실',
    '동네 카페',
    '노을 진 옥상',
    '도시의 밤',
    '네온 골목',
    '자취방 창가',
  ],
};

const SUBJECT_POOL: Record<TemplateId, string[]> = {
  balance: ['직장인', '사회초년생', '팀원'],
  living: ['자취 3년차', '첫 자취러', '혼자 사는 직장인'],
  love: ['썸 타는 사람', '연애 초보', '소개팅 당사자'],
  review: ['리뷰어', '먹어본 사람', '제품 사용자'],
  issue: ['뉴스를 정리하는 사람', '직장인', '기자'],
  it: ['기획자', '개발자', 'IT 종사자'],
};

const CAMERA_POOL: Record<Shot['role'], string[]> = {
  hook: ['punch-in', 'push-in', 'shake', 'orbit'],
  body: ['push-in', 'pan-left', 'pan-right', 'tilt-up', 'handheld', 'slide'],
  cta: ['zoom-out', 'pan-left', 'handheld', 'tilt-up'],
};

const MOOD_BY_TONE: Record<Tone, string[]> = {
  cider: ['tense', 'hype', 'bright', 'cold'],
  empathy: ['warm', 'dreamy', 'gloomy', 'bright'],
  humor: ['comic', 'hype', 'bright', 'tense'],
};

/** 표정 낱말 — 렌더러가 다시 읽어 그림을 고르므로 한국어 그대로 둡니다. */
const EXPRESSION_BY_ART: Record<string, string> = {
  smile: '웃는',
  tired: '지친',
  shock: '놀란',
  angry: '화난',
  sad: '시무룩한',
  smirk: '비웃는',
  smug: '뿌듯한',
  dizzy: '혼란스러운',
  neutral: '무표정',
};

const VISUAL_RULES: { key: string; expression?: string; action?: string; props?: string[]; mood?: string }[] = [
  { key: '월급', expression: '지친', action: '지폐를 든', props: ['지폐', '시계'], mood: 'tense' },
  { key: '연봉', expression: '뿌듯한', action: '지폐를 든', props: ['지폐', '차트'], mood: 'bright' },
  { key: '칼퇴', expression: '웃는', action: '엄지 척', props: ['시계'], mood: 'bright' },
  { key: '야근', expression: '지친', action: '머리를 감싼', props: ['시계', '커피'], mood: 'gloomy' },
  { key: '재택', expression: '무표정', action: '노트북을 보는', props: ['노트북'], mood: 'cold' },
  { key: '자취', expression: '무표정', action: '손가락으로 짚는', props: ['화분', '커피'], mood: 'warm' },
  { key: '월세', expression: '지친', action: '지폐를 든', props: ['지폐'], mood: 'tense' },
  { key: '전기', expression: '놀란', action: '차트를 보는', props: ['차트', '플러그'], mood: 'tense' },
  { key: '냉장고', expression: '무표정', action: '문을 여는', props: ['냉장고'], mood: 'cold' },
  { key: '카톡', expression: '혼란스러운', action: '휴대폰을 보는', props: ['휴대폰'], mood: 'tense' },
  { key: '소개팅', expression: '놀란', action: '휴대폰을 보는', props: ['휴대폰', '커피'], mood: 'comic' },
  { key: '연애', expression: '시무룩한', action: '팔짱 낀', props: ['하트'], mood: 'gloomy' },
  { key: '썸', expression: '웃는', action: '두 손을 벌린', props: ['하트', '휴대폰'], mood: 'dreamy' },
  { key: '고백', expression: '놀란', action: '두 손을 벌린', props: ['하트'], mood: 'dreamy' },
  { key: '커피', expression: '무표정', action: '컵을 든', props: ['커피'], mood: 'warm' },
  { key: '웨이팅', expression: '지친', action: '시계를 보는', props: ['시계'], mood: 'comic' },
  { key: '이어폰', expression: '무표정', action: '이어폰을 끼는', props: ['이어폰'], mood: 'cold' },
  { key: 'AI', expression: '무표정', action: '노트북을 보는', props: ['노트북'], mood: 'cold' },
  { key: '출시', expression: '뿌듯한', action: '주먹 쥔', props: ['차트', '노트북'], mood: 'hype' },
  { key: '로그인', expression: '혼란스러운', action: '손가락으로 짚는', props: ['휴대폰'], mood: 'cold' },
  { key: '금리', expression: '지친', action: '차트를 보는', props: ['차트', '지폐'], mood: 'tense' },
  { key: '환율', expression: '놀란', action: '차트를 보는', props: ['차트'], mood: 'tense' },
  { key: '돈', expression: '놀란', action: '지폐를 든', props: ['지폐'], mood: 'tense' },
  { key: '시간', expression: '지친', action: '머리를 감싼', props: ['시계'], mood: 'tense' },
];

/** 장소 낱말 → 그림 결 — 같은 장소가 두 번 나와도 결이 흔들리지 않게. */
const SCENE_GENRE: { genre: string; words: string[] }[] = [
  { genre: 'cozy', words: ['자취', '원룸', '주방', '살림', '빈방'] },
  { genre: 'cafe', words: ['카페', '라테', '브런치', '식탁', '카운터'] },
  { genre: 'office', words: ['사무실', '회의실', '지하철', '책상', '엘리베이터', '옥상', '출근', '퇴근'] },
  { genre: 'rain', words: ['비', '창가', '골목', '창'] },
  { genre: 'night', words: ['밤', '야경', '도시', '네온', '작업실'] },
  { genre: 'royal', words: ['궁', '정원', '달빛', '드레스', '연회'] },
  { genre: 'nature', words: ['벚꽃', '공원', '산책'] },
];

function genreOfScene(scene: string): string | undefined {
  return SCENE_GENRE.find((row) => row.words.some((word) => scene.includes(word)))?.genre;
}

const DEFAULT_PROPS: Record<TemplateId, string[]> = {
  balance: ['지폐', '시계'],
  living: ['화분', '커피'],
  love: ['휴대폰', '하트'],
  review: ['커피', '접시'],
  issue: ['노트북', '차트'],
  it: ['노트북', '차트'],
};

function pickVisual(
  template: TemplateId,
  tone: Tone,
  text: string,
  sceneHint: string,
  role: Shot['role'],
  rng: Rng,
  usedScenes: Set<string>,
  usedCameras: Set<string>,
): CutVisual {
  const matched = VISUAL_RULES.filter((rule) => text.toLowerCase().includes(rule.key.toLowerCase()));
  const rule = matched.length ? rng.pick(matched) : null;
  const derived = expressionFromWords(text);
  const expression =
    rule?.expression ??
    (derived ? EXPRESSION_BY_ART[derived] ?? '무표정' : role === 'cta' ? '웃는' : rng.pick(['무표정', '지친', '놀란']));

  // 대본이 정한 장소를 우선합니다(같은 집의 주방이 두 번 나오는 건 자연스러움).
  const scenes = SCENE_POOL[template];
  let scene = sceneHint;
  if (!scene) {
    const fresh = scenes.filter((candidate) => !usedScenes.has(candidate));
    scene = rng.pick(fresh.length ? fresh : scenes);
  }
  usedScenes.add(scene);

  const cameraChoices = CAMERA_POOL[role].filter((camera) => !usedCameras.has(camera));
  const camera = rng.pick(cameraChoices.length ? cameraChoices : CAMERA_POOL[role]);
  usedCameras.add(camera);

  const action =
    rule?.action ??
    rng.pick(
      role === 'cta'
        ? ['엄지 척', '두 손을 벌린', '주먹 쥔']
        : ['손가락으로 짚는', '휴대폰을 보는', '두 손을 벌린', '팔짱 낀', '컵을 든'],
    );
  const props = rule?.props ?? [rng.pick(DEFAULT_PROPS[template]), rng.pick(['시계', '화분', '커피', '휴대폰', '차트'])];

  return {
    scene,
    genre: genreOfScene(scene),
    subject: rng.pick(SUBJECT_POOL[template]),
    expression,
    action,
    camera,
    props: [...new Set(props)].slice(0, 3),
    mood: rule?.mood ?? rng.pick(MOOD_BY_TONE[tone]),
  };
}

/* ── 길이·조립 ─────────────────────────────────────────── */

/** 나레이션 한 문장이 실제로 읽히는 시간(초) — 한국어 낭독 약 7.4자/초 + 컷 여백. */
export function secondsForVoice(text: string): number {
  const clean = text.replace(/\s+/g, ' ').trim();
  const commas = (clean.match(/[,·]/g) ?? []).length;
  const stops = (clean.match(/[.!?…]/g) ?? []).length;
  const seconds = 0.5 + clean.length * 0.125 + commas * 0.06 + stops * 0.045;
  return Math.round(Math.max(1.6, Math.min(9.5, seconds)) * 10) / 10;
}

function fill(line: string, vars: { topic: string; a: string; b: string }): string {
  return line.replace(/\{topic\}/g, vars.topic).replace(/\{A\}/g, vars.a).replace(/\{B\}/g, vars.b);
}

function splitBalance(topic: string): [string, string] {
  const parts = topic
    .split(/\s*(?:vs\.?|VS\.?|아니면|\/)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const a = parts[0] ?? topic;
  const b = parts[1] ?? '그 반대편';
  return [clampText(a, 16), clampText(b, 16)];
}

function makeTitle(topic: string): string {
  return clampText(topic.replace(/\s+/g, ' '), 22) || '새 쇼츠';
}

export interface BuildInput {
  topic: string;
  template: TemplateId;
  tone: Tone;
}

interface DraftCut {
  s: string;
  v: string;
  sc: string;
}

/** 팩/구조에서 이번 영상의 10컷 초안을 만듭니다. */
function draftCuts(input: BuildInput, topic: string): { title: string; cuts: DraftCut[] } {
  const pack: ScriptPack | null = findPack(input.template, topic, input.tone);
  const vars = { topic: clampText(topic, 24), a: splitBalance(topic)[0], b: splitBalance(topic)[1] };

  if (pack) {
    const cuts: DraftCut[] = pack.cuts.map((cut: PackCut) => ({
      s: fill(cut.s, vars),
      v: fill(cut.v, vars),
      sc: cut.sc,
    }));
    const hookOverride = toneHook(pack, input.tone);
    if (hookOverride && cuts[0]) cuts[0] = { ...cuts[0], v: hookOverride };
    return { title: pack.title, cuts };
  }

  const scaffold = SCAFFOLDS[input.template];
  const hook = pick(scaffold.hook[input.tone]);
  const hookS = fill(hook.s, vars);
  const hookV = fill(hook.v, vars);
  const cta = pick(scaffold.cta[input.tone]);
  const cuts: DraftCut[] = [
    { s: hookS, v: hookV, sc: SCENE_POOL[input.template][0] ?? '' },
    ...scaffold.body.map((line, index) => ({
      s: fill(line.s, vars),
      v: fill(line.v, vars),
      sc: SCENE_POOL[input.template][(index + 1) % SCENE_POOL[input.template].length] ?? '',
    })),
    {
      s: fill(cta.s, vars),
      v: fill(cta.v, vars),
      sc: '해냈다 사이다',
    },
  ];
  return { title: makeTitle(topic), cuts };
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

/** 주제 한 줄 → 10컷 쇼츠(40~55초). 네트워크 없이 즉시 끝납니다. */
export function buildLocalShorts(input: BuildInput): Shorts {
  const template = TEMPLATE_MAP[input.template];
  const topic = input.topic.trim() || template.topics[0] || '새 쇼츠';
  const seed = newSeed();
  const rng = createRng(seed);
  const usedScenes = new Set<string>();
  const usedCameras = new Set<string>();
  const fallbackDurations = defaultDurations(DEFAULT_CUTS);

  const draft = draftCuts(input, topic);
  const cuts: Shot[] = draft.cuts.slice(0, DEFAULT_CUTS).map((cut, index, list) => {
    const role = roleOf(index, list.length);
    // 자막의 *강조* 표기는 화면에서 색으로 바뀌므로 그대로 둡니다(잘리면 짝을 다시 맞춤).
    let subtitle = clampText(cut.s.replace(/\s+/g, ' ').trim(), 34);
    if ((subtitle.match(/\*/g) ?? []).length % 2 === 1) subtitle += '*';
    const voice = cut.v.replace(/\s+/g, ' ').trim();
    return {
      id: `cut-${Date.now().toString(36)}-${index}`,
      role,
      emoji: template.cards[index % template.cards.length] ?? '✨',
      subtitle,
      voice,
      duration: secondsForVoice(voice) || fallbackDurations[index] || 3,
      visual: pickVisual(input.template, input.tone, `${cut.s} ${voice}`, cut.sc, role, rng, usedScenes, usedCameras),
    };
  });

  // 전체가 60초를 넘으면 비율대로 줄입니다(쇼츠 업로드 한도).
  const total = cuts.reduce((sum, cut) => sum + cut.duration, 0);
  if (total > 59) {
    const ratio = 59 / total;
    for (const cut of cuts) cut.duration = Math.max(1.6, Math.round(cut.duration * ratio * 10) / 10);
  }

  return {
    title: draft.title,
    topic,
    template: input.template,
    tone: input.tone,
    banner: template.banner,
    cuts,
    source: 'local',
    updatedAt: Date.now(),
    seed,
    audio: { ...DEFAULT_AUDIO, mood: BGM_BY_TEMPLATE[input.template] },
    style: { ...DEFAULT_STYLE },
    brand: { ...DEFAULT_BRAND },
  };
}

/** 컷별 안내문에 쓰는 짧은 화면 설명. */
export function sceneNote(template: TemplateId, index: number): string {
  const map: Record<TemplateId, string[]> = {
    balance: [
      'A와 B가 한 화면에 보이는 구도로 시작. 훅 자막 0.2초 늦게 팝.',
      '1번 선택지 쪽으로 줌인. 선택지 라벨을 상단에 고정.',
      '같은 장면을 타이트하게 다시 잡아 대가를 강조.',
      '2번 선택지로 화면 전환. 색온도를 반대로.',
      '2번의 장점을 클로즈업으로. 자막은 더 짧게.',
      '함정은 생활 장면으로 — 점심·야근·주말.',
      '두 선택지의 손해를 나란히 보여주기.',
      '돈과 시간을 숫자로 비교하는 컷.',
      '3년 뒤 시점으로 한 박자 쉬어가기.',
      '정면 구도로 돌아와 댓글 유도.',
    ],
    living: [
      '집 안 전경이나 손 클로즈업으로 시작.',
      '문제 상황(요금·수납)을 한 컷으로 보여주기.',
      '해결 전후를 나란히. 자막은 결론부터.',
      '실제 물건 클로즈업으로 신뢰감.',
      '동작을 보여주는 컷 — 물기를 미는 손.',
      '수납 전후를 같은 앵글로.',
      '고지서·내역서 클로즈업.',
      '고정비를 적는 장면.',
      '정리된 화면에서 한 번 쉬기.',
      '저장 유도 자막과 함께 마무리.',
    ],
    love: [
      '휴대폰 화면이나 표정 클로즈업으로 시작.',
      '대화 장면. 말풍선 자막을 크게.',
      '표정이 바뀌는 순간을 잡아 반전.',
      '상대 시선의 장면으로 전환.',
      '한 박자 쉬어가는 클로즈업.',
      '거리감 있는 두 사람 구도.',
      '창가 빛으로 분위기 전환.',
      '비·밤 장면으로 감정 낮추기.',
      '다시 밝은 톤으로.',
      '미소로 마무리하며 댓글 유도.',
    ],
    review: [
      '가게 앞이나 제품 클로즈업으로 시작. 결론을 먼저 던지기.',
      '첫인상 장면 — 플레이팅·패키지 클로즈업.',
      '아쉬웠던 지점을 같은 앵글로 다시.',
      '가격·양을 숫자로 보여주는 컷.',
      '음료 클로즈업으로 균형 잡기.',
      '대기 줄을 보여주는 컷.',
      '창가·조명을 보여주는 컷.',
      '계산서를 숫자로.',
      '평일 대비 장면.',
      '결론 한 줄과 저장 유도.',
    ],
    issue: [
      '뉴스 화면이나 모니터 클로즈업으로 시작. 숫자 하나를 크게.',
      '첫 번째 이슈 — 배경을 어둡게 두고 자막을 크게.',
      '두 번째 이슈로 전환. 화면 색온도를 바꿔 구분.',
      '세 번째 이슈는 짧게, 한 문장으로.',
      '영향을 받는 사람의 시선으로 한 컷.',
      '숫자는 방향만 보여주기.',
      '확인되지 않은 정보는 흐리게.',
      '한 줄 요약과 저장 유도.',
      '다음 주 예고 한 줄.',
      '마무리 자막.',
    ],
    it: [
      '화면 UI나 기기 클로즈업으로 시작.',
      '첫 번째 포인트를 화면 녹화처럼 보여주기.',
      '숫자·아이콘을 크게 띄워 강조.',
      '두 번째 포인트로 전환.',
      '결론을 한 줄로. 배경은 어둡게.',
      '실패 화면을 보여주는 컷.',
      '수정 전후를 비교.',
      '출시 장면으로 밝게.',
      '피드백 정리 장면.',
      '저장·팔로우 유도 자막.',
    ],
  };
  const notes = map[template];
  return notes[index % notes.length] ?? notes[0] ?? '';
}

/** 이 컷을 읽을 때 쓸 음성 문장(별표 제거). */
export function narrationOf(shot: Shot): string {
  return (shot.voice ?? '').replace(/\*/g, '').trim() || stripMarks(shot.subtitle);
}
