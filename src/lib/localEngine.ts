import type { Shorts, Shot, TemplateId, Tone } from '../types';
import { CUT_DURATIONS, TEMPLATE_MAP, roleOf } from './templates';
import { clampText, stripMarks } from './text';
import { newSeed } from './scenes';

/**
 * AI 키가 없거나 서버에 닿지 않아도 바로 쓸 수 있는 내장 대본 엔진.
 * 추천 주제는 컷마다 실제로 쓸 수 있는 문장을 넣어 두고,
 * 직접 입력한 주제는 '주제 + 그 카테고리의 기본 팁'으로 조립합니다.
 */

interface Entry {
  keywords: string[];
  title: string;
  hook: Record<Tone, string[]>;
  body: [string, string, string, string];
  cta: Record<Tone, string[]>;
}

const ENTRIES: Record<TemplateId, Entry[]> = {
  balance: [
    {
      keywords: ['야근', '월급 1.5', '월급1.5', '월급 1.5배'],
      title: '월급 1.5배 vs 칼퇴',
      hook: {
        cider: ['직장인 *최악의 지옥*, 하나만 고른다면?', '밤 9시 퇴근과 *칼퇴*, 딱 하나만'],
        empathy: ['이거 매일 고민하는데… 솔직히 어느 쪽?', '둘 다 싫은데 *하나만* 고르라면'],
        humor: ['*월급*이야 *칼퇴*야? 고르는 순간 인생 끝남', '이거 고르고 *후회*하는 사람 너무 많음'],
      },
      body: [
        '월급 *1.5배*에 매일 밤 9시 퇴근',
        '대신 주말 *단톡방*까지 따라옴',
        '*칼퇴* 보장, 월급은 3년째 동결',
        '점심 먹는데 팀장이 "*바쁘지?*"',
      ],
      cta: {
        cider: ['둘 다 *퇴사각*. 댓글로 골라줘', '*1번*이야 *2번*이야? 댓글로'],
        empathy: ['둘 다 힘든데… 당신은 *어느 쪽*?', '댓글로 *솔직하게* 알려줘'],
        humor: ['댓글 안 달면 *야근* 확정', '*1번*? *2번*? 안 달면 팀장 옆자리'],
      },
    },
    {
      keywords: ['재택', '연봉 20', '출근'],
      title: '평생 재택 vs 연봉 20%',
      hook: {
        cider: ['평생 *재택*? 연봉 *20%*? 하나만', '출근 0분과 연봉 인상, 딱 하나'],
        empathy: ['재택 좋아하다가도 *이건* 고민됨', '출근이냐 돈이냐, 진짜 어렵지 않아?'],
        humor: ['재택 고르면 *화상회의*가 집으로 옴', '*연봉 20%*면 출근할 사람?'],
      },
      body: [
        '평생 *재택*, 출근 0분',
        '대신 모든 회의는 *화상* 속에서',
        '연봉 *20%* 인상, 대신 출근 4일',
        '왕복 2시간이 *진짜 월급*',
      ],
      cta: {
        cider: ['*재택*? *출근*? 댓글로', '돈이냐 시간이냐, 댓글로 골라줘'],
        empathy: ['당신의 *하루*는 어느 쪽?', '댓글로 *이유*까지 들려줘'],
        humor: ['*재택* 고르고 *월요일* 맞이하기', '댓글 안 달면 내일 출근'],
      },
    },
    {
      keywords: ['점심', '칼퇴 30'],
      title: '점심 2시간 vs 칼퇴 30분',
      hook: {
        cider: ['점심 *2시간*과 칼퇴 30분, 하나만', '*점심*을 늘릴까 *퇴근*을 당길까'],
        empathy: ['점심시간, 진짜 *길면* 좋을까?', '이거 고르면 *하루*가 달라져'],
        humor: ['점심 *2시간* 고르면 오후가 사라짐', '이 선택, *점심*보다 진지함'],
      },
      body: [
        '점심 *2시간*, 산책까지 가능',
        '대신 오후는 *밀린 채로* 시작',
        '*5시 30분* 퇴근, 점심은 10분',
        '그 30분이 *진짜 인생*',
      ],
      cta: {
        cider: ['*2시간*? *30분*? 댓글로', '점심파냐 칼퇴파냐, 댓글로'],
        empathy: ['당신은 *어느 쪽*이 편해?', '댓글에 *이유* 남겨줘'],
        humor: ['*점심* 고르고 오후 *멘붕* 오는 거', '댓글 안 달면 점심 10분'],
      },
    },
    {
      keywords: ['회식', '3차', '2차'],
      title: '회식 3차 vs 2차 귀가',
      hook: {
        cider: ['*회식* 하나로 평판이 갈립니다', '3차와 2차 귀가, 하나만'],
        empathy: ['회식 끝나고 *혼자* 고민하는 밤', '이거 진짜 *매번* 고민돼'],
        humor: ['3차 가면 *다음 날*이 문제입니다', '*회식* 몇 차까지가 안전할까'],
      },
      body: [
        '*3차*까지, 새벽 1시 귀가',
        '다음 날 얼굴은 *시체*, 팀장 마음은 1등',
        '*2차*에서 자연스럽게 이탈',
        '다음 날 컨디션 최상, 평점은 *미지수*',
      ],
      cta: {
        cider: ['*3차*? *귀가*? 댓글로', '당신은 *몇 차*까지? 댓글로'],
        empathy: ['회식, 어디까지가 *편해*?', '댓글로 *경험* 알려줘'],
        humor: ['3차 고르고 *출근*하는 사람', '댓글 안 달면 *4차* 감'],
      },
    },
  ],
  living: [
    {
      keywords: ['꿀팁', '자취 3', '자취3', '자취'],
      title: '자취 3년차 꿀팁',
      hook: {
        cider: ['자취 *3년차*가 늦게 안 사실', '이거 모르고 *자취* 3년 했음'],
        empathy: ['자취 *3년차*, 이건 진짜 늦게 알았어', '혼자 살면서 *하나씩* 배운 것들'],
        humor: ['자취 *3년차*가 피눈물로 배운 것', '*자취* 3년차, 이거 몰라서 삽질함'],
      },
      body: [
        '전기요금은 *누진세* 구간부터 확인',
        '여름엔 *에어컨*이 제습기보다 효율적',
        '수납은 *바닥* 말고 *세로*',
        '철제 선반 하나로 *수납* 두 배',
      ],
      cta: {
        cider: ['이 셋만 해도 *자취 난이도* 반감', '하나만 해도 *생활*이 달라짐'],
        empathy: ['하나씩 해보면 *생활*이 편해져요', '작은 것부터 *바꿔* 보세요'],
        humor: ['3년 동안 *수업료* 낸 정보입니다', '저장 안 하면 *또 삽질*'],
      },
    },
    {
      keywords: ['첫 자취', '원룸', '자취 시작', '사면 후회'],
      title: '첫 자취, 사면 후회',
      hook: {
        cider: ['첫 자취, *이것부터* 사면 돈 버림', '첫 자취 *풀세트*는 함정'],
        empathy: ['첫 자취 때 *이거* 사서 후회했어', '첫 자취, *미리* 알았으면'],
        humor: ['첫 자취 *풀세트* 사면 창고 됨', '첫 자취, *다* 사면 집이 좁아짐'],
      },
      body: [
        '가구는 *실측*하고 사기',
        '냉장고는 *문 열리는 방향*부터',
        '청소기는 *유선*이 오래 감',
        '커튼은 *암막* 하나면 충분',
      ],
      cta: {
        cider: ['첫 자취, *이 네 개*만 챙겨', '*사기 전에* 저장'],
        empathy: ['천천히 *하나씩* 맞춰도 돼요', '처음엔 *최소*로 시작해요'],
        humor: ['*풀세트*는 유튜버 몫입니다', '장바구니 *비우기*부터'],
      },
    },
    {
      keywords: ['월세', '관리비', '전세', '아끼는'],
      title: '월세 아끼는 법',
      hook: {
        cider: ['월세 *10만원* 아끼는 방법', '집 구할 때 *이것*만 확인'],
        empathy: ['월세 오를 때마다 *마음*이 무거워', '집값보다 *관리비*가 무서워'],
        humor: ['월세 *고정*되는 방법은 없지만', '관리비 *내역서* 안 보는 사람'],
      },
      body: [
        '관리비 *내역서*부터 요청',
        '전세대출은 *금리*부터 비교',
        '가스비는 *계절*로 두 배',
        '중개보수는 *법정 요율* 확인',
      ],
      cta: {
        cider: ['이사 전에 *이 네 줄* 확인', '*계약* 전에 저장'],
        empathy: ['집은 *천천히* 봐도 돼요', '서두르면 *손해*부터 와요'],
        humor: ['월세는 *안 오르는* 게 제일', '*이사*는 다음 생에'],
      },
    },
  ],
  love: [
    {
      keywords: ['소개팅', '첫 카톡', '카톡'],
      title: '소개팅 첫 카톡',
      hook: {
        cider: ['첫 카톡, *이 한 줄*이면 끝', '소개팅 첫 카톡은 *질문* 하나'],
        empathy: ['첫 카톡에서 *이거* 하면 마음 식어', '첫 카톡, 뭐라고 보내야 할까'],
        humor: ['첫 카톡에 "*안녕하세요*"만 보내면 끝', '첫 카톡 *3시간* 고민한 사람 여기'],
      },
      body: [
        '*질문 하나*로 시작하면 대화가 열림',
        '답장은 *속도*보다 *내용*',
        '이모티콘은 *한 개*면 충분',
        '약속은 *내가* 먼저 잡기',
      ],
      cta: {
        cider: ['첫 카톡, *저장*해두고 쓰세요', '이거면 *읽씹* 안 당함'],
        empathy: ['너무 *애쓰지* 않아도 돼요', '편하게 *한 줄* 보내보세요'],
        humor: ['이거 보내고 *답장* 오면 성공', '저장 안 하면 *또* 고민함'],
      },
    },
    {
      keywords: ['연애', '권태기', '다툼', '싸움', '금지'],
      title: '연애 초반 금지어',
      hook: {
        cider: ['연애 초반, *이 말*은 금지', '이 한마디가 *관계*를 끝냅니다'],
        empathy: ['좋아할수록 *조심*하게 되는 말', '이거 듣고 *마음* 식었어'],
        humor: ['연애 초반 *이 말* 하면 끝', '*말* 한마디로 정리되는 연애'],
      },
      body: [
        '*비교*는 그 자리에서 금지',
        '서운함은 *그때* 말하기',
        '연락은 *확인*이 아니라 *안부*',
        '싸우면 *결론*보다 *이해*',
      ],
      cta: {
        cider: ['*이 네 줄*만 지켜도 절반', '연애 *저장*해두세요'],
        empathy: ['서로 *한 번씩*만 참아보기', '말투 하나가 *관계*를 바꿔요'],
        humor: ['*비교*부터 안 하기로 해요', '이거 보고 *반성*했습니다'],
      },
    },
    {
      keywords: ['썸', '고백', '짝사랑'],
      title: '썸 탈 때 확실한 신호',
      hook: {
        cider: ['썸인지 *아닌지* 3초 만에', '이 신호 *하나*면 확실함'],
        empathy: ['이 사람 *나를* 좋아하는 걸까', '썸, *확신*이 없어서 힘들지'],
        humor: ['썸 *확신*하다가 친구 됨', '이 신호 *놓치면* 끝'],
      },
      body: [
        '*답장 길이*가 신호',
        '만남은 *제안*이 답',
        '스킨십은 *한 단계*씩',
        '고백은 *장소*보다 *타이밍*',
      ],
      cta: {
        cider: ['*신호* 보이면 바로 고백', '망설이면 *친구* 됨'],
        empathy: ['마음 *확인*은 천천히', '좋으면 *표현*해도 돼요'],
        humor: ['썸은 *타이밍*이고 인생은 *운*', '고백 *저장*하고 가세요'],
      },
    },
  ],
  it: [
    {
      keywords: ['ai', 'AI', '인공지능', '앱'],
      title: 'AI 앱 제대로 쓰는 법',
      hook: {
        cider: ['AI한테 *검색* 시키면 반만 씀', 'AI는 *초안* 시킬 때 제일 셈'],
        empathy: ['AI *이렇게* 쓰면 진짜 편해', 'AI, 어렵게 쓰면 *손해*'],
        humor: ['AI한테 *숙제* 시키면 내가 숙제함', 'AI랑 *대화*만 해도 하루 감'],
      },
      body: [
        '*초안* 시키고 내가 고치기',
        '질문에 *조건*을 붙이기',
        '결과는 *출처* 확인',
        '반복 작업은 *템플릿*으로',
      ],
      cta: {
        cider: ['*프롬프트* 하나만 바꿔도 달라짐', '저장하고 *내일* 써먹으세요'],
        empathy: ['천천히 *하나씩* 익혀보세요', '도구는 *익숙해지면* 편해져요'],
        humor: ['AI *쓰는 척*만 하지 말기', '이거 보고 *프롬프트* 고침'],
      },
    },
    {
      keywords: ['트렌드', '2026', '전망', '요즘'],
      title: '요즘 IT 트렌드',
      hook: {
        cider: ['2026 IT, *이 네 개*만 보면 됨', '올해 기술 뉴스, *한 줄*로'],
        empathy: ['요즘 테크 뉴스 *따라가기* 힘들지', 'IT 트렌드, *이것만* 알아도'],
        humor: ['IT 트렌드 *다* 알면 머리 아픔', '신기술 *이름*만 외우면 반'],
      },
      body: [
        'AI는 *기능*에서 *요금제*로',
        '앱은 *로그인*부터 줄임',
        '*온디바이스* AI가 기본',
        '보안은 *패스키*로 이동',
      ],
      cta: {
        cider: ['*이 네 줄*이면 대화 가능', '저장해두면 *IT 뉴스* 정리됨'],
        empathy: ['모르면 *검색*하면 돼요', '천천히 *하나씩* 알면 돼요'],
        humor: ['모르는 척 *고개*만 끄덕였죠', '이거 보고 *아는 척* 하세요'],
      },
    },
    {
      keywords: ['개발', '출시', '체크', '서비스'],
      title: '앱 출시 전 체크리스트',
      hook: {
        cider: ['앱 출시 전, *이 네 개*만 확인', '출시하고 *후회*하는 순서'],
        empathy: ['첫 앱 출시, *긴장*되는 거 당연해', '출시 전 *이건* 꼭 봐요'],
        humor: ['첫 출시 *완벽*하다고 생각했는데', '출시 *하루* 전에 발견하는 것들'],
      },
      body: [
        '*로그인* 없이 써보게',
        '첫 화면에 *할 일* 하나',
        '*로딩* 3초면 절반 이탈',
        '*개인정보* 수집은 최소로',
      ],
      cta: {
        cider: ['출시 전에 *이 네 줄* 확인', '*체크리스트* 저장'],
        empathy: ['첫 버전은 *작아도* 괜찮아요', '피드백이 *다음* 버전을 살려요'],
        humor: ['출시 후 *수정*은 기본값', '이거 보고 *눈물* 닦음'],
      },
    },
  ],
};

const FALLBACK = {
  balance: {
    hook: {
      cider: ['*{A}* vs *{B}*, 3초 안에 골라봐', '*{A}*냐 *{B}*냐, 고르면 후회각'],
      empathy: ['*{A}*와 *{B}*, 솔직히 둘 다 끌리지?', '이거 고르는 데 *일주일* 걸렸어'],
      humor: ['*{A}* vs *{B}*, 친구 사이 갈라놓는 질문', '*{A}* 고른 사람 *손*'],
    },
    body: [
      '*{A}* 고르면 첫 한 달은 천국',
      '근데 석 달 뒤 *진짜 청구서*가 날아옴',
      '*{B}* 고르면 처음엔 *손해* 같음',
      '그런데 1년 뒤 웃는 쪽은 *따로* 있음',
    ],
    cta: {
      cider: ['나는 *{A}*. 반박하면 네 말이 맞음', '*1번* vs *2번*, 댓글로 싸우자'],
      empathy: ['너라면 *어느 쪽*? 이유가 궁금해', '댓글에 *네 선택* 남겨줘'],
      humor: ['*{B}* 고른 사람, 댓글로 *자수*하세요', '댓글 안 달면 *둘 다* 당첨'],
    },
  },
  living: {
    hook: {
      cider: ['*{topic}*, 아직도 이렇게 하세요?', '*{topic}* 하다가 *돈 새는* 구간'],
      empathy: ['*{topic}*, 나만 어려운 줄 알았어', '*{topic}*, 처음엔 다 *삽질*해요'],
      humor: ['*{topic}* 검색하다 여기까지 온 사람', '*{topic}*, 안 알려주던 *그것*'],
    },
    body: [
      '다들 *{topic}* 이렇게 시작하다 후회함',
      '문제는 *처음 10분*에서 갈림',
      '돈은 *나중에* 써도 늦지 않음',
      '이것만 지키면 *{topic}* 절반은 끝',
    ],
    cta: {
      cider: ['*저장*해두면 두 번 안 찾음', '이거 몰랐으면 *저장* 먼저'],
      empathy: ['나만 이런 줄 알았다면 *저장*', '다음엔 *덜 삽질*하길'],
      humor: ['저장 안 하면 *또* 검색하러 옴', '스크랩 안 하면 *월세* 올라감'],
    },
  },
  love: {
    hook: {
      cider: ['*{topic}*, 여기서 *대부분* 틀림', '*{topic}*, 이 한 끗 차이'],
      empathy: ['*{topic}*, 머릿속이 *복잡*하지', '*{topic}*, 괜찮아 다들 그래'],
      humor: ['*{topic}* 때문에 새벽 3시에 깸', '*{topic}*, 읽씹 *당한* 사람 모여'],
    },
    body: [
      '상대는 *말*보다 타이밍을 기억함',
      '답장이 늦는 건 *마음*이 아닐 수도',
      '*비교*하는 순간 대화가 식음',
      '서운함은 *그날 밤*에 말해야 안 커짐',
    ],
    cta: {
      cider: ['이거 *써먹고* 후기 남겨줘', '*저장*하고 다음 약속에 써봐'],
      empathy: ['너무 *애쓰지* 않아도 돼, 진짜', '비슷한 일 있었다면 *댓글*로'],
      humor: ['이거 보고 *뜨끔*한 사람 댓글', '*전 애인*한테 보내지 마세요'],
    },
  },
  it: {
    hook: {
      cider: ['*{topic}*, 모르면 *뒤처지는* 이유', '*{topic}*, 4컷이면 정리됨'],
      empathy: ['*{topic}*, 어렵게 생각 안 해도 돼', '*{topic}*, 나도 처음엔 *멘붕*'],
      humor: ['*{topic}* 아는 척하고 싶은 사람', '*{topic}*, 회의 때 *한 마디* 용'],
    },
    body: [
      '핵심은 *기능*이 아니라 *쓰는 순서*',
      '처음엔 *작은 것* 하나만 시켜보기',
      '결과는 *꼭* 내 눈으로 한 번 확인',
      '개인정보는 *넣기 전*에 한 번 더',
    ],
    cta: {
      cider: ['*저장*해두면 바로 써먹음', '이 순서만 외워도 *반은* 성공'],
      empathy: ['하나만 *오늘* 해보세요', '궁금한 건 *댓글*로 물어봐'],
      humor: ['저장만 하고 *안* 쓰죠? 다 알아요', '회의에서 *아는 척*하세요'],
    },
  },
} as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
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

function findEntry(template: TemplateId, topic: string): Entry | null {
  const haystack = topic.toLowerCase();
  const entries = ENTRIES[template];
  return (
    entries.find((entry) => entry.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) ?? null
  );
}

function fill(line: string, vars: { topic: string; a: string; b: string }): string {
  return line.replace(/\{topic\}/g, vars.topic).replace(/\{A\}/g, vars.a).replace(/\{B\}/g, vars.b);
}

function makeTitle(topic: string): string {
  return clampText(topic.replace(/\s+/g, ' '), 22) || '새 쇼츠';
}

export interface BuildInput {
  topic: string;
  template: TemplateId;
  tone: Tone;
}

/** 주제 한 줄 → 6컷 쇼츠. 네트워크 없이 즉시 끝납니다. */
export function buildLocalShorts(input: BuildInput): Shorts {
  const template = TEMPLATE_MAP[input.template];
  const topic = input.topic.trim() || template.topics[0] || '새 쇼츠';
  const [a, b] = splitBalance(topic);
  const entry = findEntry(input.template, topic);
  const vars = { topic: clampText(topic, 24), a, b };

  let lines: string[];
  let title: string;
  if (entry) {
    title = entry.title;
    lines = [pick(entry.hook[input.tone]), ...entry.body, pick(entry.cta[input.tone])];
  } else {
    const bank = FALLBACK[input.template];
    title = makeTitle(topic);
    lines = [pick(bank.hook[input.tone]), ...bank.body, pick(bank.cta[input.tone])];
  }

  const stamp = Date.now().toString(36);
  const cuts: Shot[] = lines.slice(0, 6).map((line, index) => ({
    id: `cut-${stamp}-${index}`,
    role: roleOf(index),
    emoji: template.cards[index] ?? '✨',
    subtitle: fill(line, vars),
    duration: CUT_DURATIONS[index] ?? 3,
  }));

  return {
    title,
    topic,
    template: input.template,
    tone: input.tone,
    banner: template.banner,
    cuts,
    seed: newSeed(),
    source: 'local',
    updatedAt: Date.now(),
  };
}

/** 컷별 안내문에 쓰는 짧은 화면 설명. */
export function sceneNote(template: TemplateId, index: number): string {
  const map: Record<TemplateId, string[]> = {
    balance: [
      'A/B 대비가 보이는 장면으로 시작. 훅 자막 0.2초 늦게 팝.',
      '1번 선택지 쪽으로 줌인. 선택지 라벨을 상단에 고정.',
      '같은 장면을 타이트하게 다시 잡아 함정을 강조.',
      '2번 선택지로 화면 전환. 색온도를 반대로.',
      '2번의 함정을 클로즈업으로. 자막은 더 짧게.',
      '정면 구도로 돌아와 댓글 유도. 마지막 자막에 강조색.',
    ],
    living: [
      '집 안 전경이나 손 클로즈업으로 시작.',
      '문제 상황(전기요금·수납)을 한 컷으로 보여주기.',
      '해결 전후를 나란히. 자막은 결론부터.',
      '실제 물건 클로즈업으로 신뢰감.',
      '팁 두 번째를 행동 장면으로.',
      '정리된 화면에서 저장 유도.',
    ],
    love: [
      '휴대폰 화면이나 표정 클로즈업으로 시작.',
      '대화 장면. 말풍선 자막을 크게.',
      '표정이 바뀌는 순간을 잡아 반전.',
      '상대 시선의 장면으로 전환.',
      '한 박자 쉬어가는 클로즈업.',
      '두 사람의 거리감 있는 구도로 마무리.',
    ],
    it: [
      '화면 UI나 기기 클로즈업으로 시작.',
      '첫 번째 포인트를 화면 녹화처럼 보여주기.',
      '숫자·아이콘을 크게 띄워 강조.',
      '두 번째 포인트로 전환.',
      '결론을 한 줄로. 배경은 어둡게.',
      '저장·팔로우 유도 자막.',
    ],
  };
  const notes = map[template];
  return notes[index % notes.length] ?? notes[0] ?? '';
}

/** 이 컷을 읽을 때 쓸 음성 문장(별표 제거). */
export function narrationOf(shot: Shot): string {
  return stripMarks(shot.subtitle);
}
