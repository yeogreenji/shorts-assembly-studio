import type { CutVisual, Shorts, Shot, TemplateId, Tone } from '../types';
import { CUT_DURATIONS, TEMPLATE_MAP, roleOf } from './templates';
import { clampText, stripMarks } from './text';
import { createRng, newSeed, type Rng } from './motion/rng';
import { BGM_BY_TEMPLATE, DEFAULT_AUDIO, DEFAULT_BRAND, DEFAULT_STYLE } from './defaults';

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
  review: [
    {
      keywords: ['브런치', '맛집', '카페', '웨이팅'],
      title: '줄 서는 브런치 카페 후기',
      hook: {
        cider: ['웨이팅 *40분* 하고 먹은 브런치, 솔직히', '줄 서서 먹는 데는 *이유*가 있더라'],
        empathy: ['줄 서서 먹고 *실망*한 적 있죠', '브런치 한 번 먹고 *기분*이 갈렸어요'],
        humor: ['*40분* 기다려서 먹은 계란 한 접시', '웨이팅 *40분*, 접시는 3분'],
      },
      body: [
        '*플레이팅*은 사진보다 예쁨',
        '대신 *커피*는 평범, 6천원',
        '*리코타* 토스트가 진짜 주인공',
        '주말 11시 전에 가면 *대기 없음*',
      ],
      cta: {
        cider: ['*주말 11시 전*, 이거 하나만 기억해', '줄 설 생각이면 *평일*로'],
        empathy: ['기다려도 *한 번은* 갈 만해요', '가실 거면 *평일 오전* 추천'],
        humor: ['웨이팅 *40분*은 운동이라 생각하기', '사진만 찍고 *나오면* 손해'],
      },
    },
    {
      keywords: ['이어폰', '무선', '가성비', '한 달', '제품'],
      title: '3만원 이어폰 한 달 후기',
      hook: {
        cider: ['3만원 *이어폰*, 한 달 써보니 결론은', '비싼 이어폰 *안 부러운* 이유'],
        empathy: ['싼 이어폰 사서 *후회*한 적 있죠', '3만원으로 *한 달* 버틸 수 있을까'],
        humor: ['3만원 이어폰 *한 달* 쓰고 든 생각', '비싼 거 살 돈으로 *치킨* 세 마리'],
      },
      body: [
        '음질은 *중저음*이 착함',
        '통화 품질은 *조용한 곳*에서만',
        '노이즈캔슬링은 *없는 셈*',
        '배터리는 *5일*은 감',
      ],
      cta: {
        cider: ['3만원이면 *출퇴근용*으로 충분', '기대는 *중저음*까지만'],
        empathy: ['처음 쓰는 분께는 *충분*해요', '가볍게 시작하기 *좋아요'],
        humor: ['이어폰 *잃어버려도* 덜 아픔', '고장 나면 *또* 3만원'],
      },
    },
    {
      keywords: ['편의점', '야식', '조합', '집에서'],
      title: '편의점 야식 조합',
      hook: {
        cider: ['편의점 *3천원*으로 야식 끝내기', '이 조합 모르면 *야식* 손해'],
        empathy: ['야식 *고민*되는 밤, 이거 어때요', '3천원으로 *행복*해지는 조합'],
        humor: ['*다이어트*는 내일의 나에게', '편의점 앞에서 *10분* 고민한 사람'],
      },
      body: [
        '컵밥 + *계란* 하나가 기본',
        '전자레인지 *2분*, 뜸 1분',
        '소스는 *반만* 넣기',
        '마무리는 *제로콜라*',
      ],
      cta: {
        cider: ['오늘 밤 *이 조합* 어때요', '저장해두고 *야식*할 때 꺼내요'],
        empathy: ['가볍게 *한 번* 해보세요', '야식도 *이 정도*면 괜찮아요'],
        humor: ['*내일*의 나는 이해해줄 거예요', '야식은 *죄*가 아닙니다'],
      },
    },
  ],
  issue: [
    {
      keywords: ['이슈', '뉴스', '요약', '주간'],
      title: '이번 주 이슈 세 줄 요약',
      hook: {
        cider: ['이번 주, *세 줄*이면 끝납니다', '놓치면 *손해*인 이번 주 이슈'],
        empathy: ['뉴스 *따라가기* 힘들죠', '이번 주 소식 *정리*했어요'],
        humor: ['뉴스 *다* 읽은 척하는 법', '이번 주도 *세상*이 바빴습니다'],
      },
      body: [
        'AI 기능은 *요금제*로 재편',
        '앱은 *로그인*부터 줄이는 중',
        '보안은 *패스키*가 기본',
        '온디바이스 AI *확산*',
      ],
      cta: {
        cider: ['*세 줄*이면 대화 됩니다', '저장해두면 *다음 주*도 통함'],
        empathy: ['하나씩 *알아가면* 돼요', '필요할 때 *꺼내* 보세요'],
        humor: ['*아는 척* 준비 완료', '저장 안 하면 *또* 검색'],
      },
    },
    {
      keywords: ['ai', 'AI', '인공지능', '서비스'],
      title: '요즘 AI 서비스 정리',
      hook: {
        cider: ['요즘 *AI* 서비스, 이것만 알면 됨', '*AI* 뉴스 하루에 하나씩 나옴'],
        empathy: ['AI *따라가기* 벅차죠', '요즘 *AI*, 어디까지 왔을까'],
        humor: ['*AI*가 내 일자리를 걱정함', 'AI 뉴스 *읽다* 하루 감'],
      },
      body: [
        '검색은 *요약*해서 답함',
        '문서는 *초안*까지 씀',
        '이미지는 *한 줄*로 생성',
        '요금은 *사용량* 기준',
      ],
      cta: {
        cider: ['*초안*부터 맡겨보세요', '저장해두고 *하나씩* 써보기'],
        empathy: ['작은 일부터 *맡겨* 보세요', '도구는 *쓰다 보면* 익숙해져요'],
        humor: ['AI *시키고* 커피 마시기', '이거 보고 *아는 척* 하세요'],
      },
    },
    {
      keywords: ['환율', '금리', '경제', '물가'],
      title: '환율·금리 뉴스 정리',
      hook: {
        cider: ['환율·금리, *이 두 줄*만 보면 됨', '뉴스 *어렵게* 쓰는 이유'],
        empathy: ['경제 뉴스 *어렵*죠', '내 *통장*에 무슨 일인지'],
        humor: ['환율 *오르면* 내 지갑이 운다', '금리 뉴스 *읽는 척* 하는 법'],
      },
      body: [
        '환율은 *수입 물가*로 이어짐',
        '금리는 *대출 이자*에 직결',
        '예금은 *만기* 분산',
        '지출은 *고정비*부터 점검',
      ],
      cta: {
        cider: ['*두 줄*만 기억하세요', '저장해두고 *통장*과 비교'],
        empathy: ['너무 *겁먹지* 않아도 돼요', '하나씩 *확인*해보세요'],
        humor: ['뉴스보다 *내 통장*이 정확함', '이거 보고 *경제* 얘기 하기'],
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
      cider: ['*{A}* vs *{B}*, 딱 하나만 고른다면?', '*{A}*이냐 *{B}*냐, 고르는 순간 끝'],
      empathy: ['이거 진짜 고민되는데… *{A}* 아니면 *{B}*?', '*{A}*와 *{B}*, 솔직히 어느 쪽?'],
      humor: ['*{A}* vs *{B}*, 고르면 인생 바뀜', '이거 고르고 *후회*하는 사람 많음'],
    },
    body: [
      '1번 *{A}*, 각오한 사람만',
      '대신 *{A}*엔 대가가 붙음',
      '2번 *{B}*, 이건 안전빵',
      '결국 *{B}*도 공짜는 없음',
    ],
    cta: {
      cider: ['*1번*? *2번*? 댓글로 골라줘', '당신 선택은? *댓글*로'],
      empathy: ['당신은 *어느 쪽*? 댓글로 알려줘', '댓글에 *이유*까지 부탁해'],
      humor: ['댓글 안 달면 *둘 다* 함', '*1번*이야 *2번*이야? 댓글로'],
    },
  },
  living: {
    hook: {
      cider: ['*{topic}*, 이거 모르면 손해', '*{topic}* — 핵심만 뽑았습니다'],
      empathy: ['*{topic}*, 저도 고민했어요', '*{topic}*, 처음이라면 특히'],
      humor: ['*{topic}* 검색하다가 여기 옴', '*{topic}*, 3년차도 몰랐던 것'],
    },
    body: [
      '전기요금은 *누진세* 구간부터 확인',
      '여름엔 *에어컨*이 제습기보다 효율적',
      '수납은 *바닥* 말고 *세로*',
      '철제 선반 하나로 *수납* 두 배',
    ],
    cta: {
      cider: ['*저장*해두면 두 번 안 찾음', '필요할 때 *꺼내* 쓰세요'],
      empathy: ['하나씩 *해보세요*', '도움되면 *저장*해두세요'],
      humor: ['저장 안 하면 *또* 검색함', '스크랩은 *자유*입니다'],
    },
  },
  love: {
    hook: {
      cider: ['*{topic}*, 이 한 줄이면 정리됨', '*{topic}* — 핵심만 말합니다'],
      empathy: ['*{topic}*, 저도 비슷했어요', '*{topic}*, 마음이 복잡하지'],
      humor: ['*{topic}* 검색한 사람 여기 모여', '*{topic}*, 나만 몰랐던 거'],
    },
    body: [
      '*질문 하나*로 시작하면 대화가 열림',
      '답장은 *속도*보다 *내용*',
      '*비교*는 그 자리에서 금지',
      '서운함은 *그때* 말하기',
    ],
    cta: {
      cider: ['*저장*해두고 쓰세요', '이거면 *절반*은 해결'],
      empathy: ['너무 *애쓰지* 않아도 돼요', '편하게 *한 번* 해보세요'],
      humor: ['저장 안 하면 *또* 고민함', '이거 보고 *반성*했습니다'],
    },
  },
  review: {
    hook: {
      cider: ['*{topic}*, 한 번 써봤습니다', '*{topic}* — 솔직 후기만'],
      empathy: ['*{topic}*, 저도 고민했어요', '*{topic}*, 사기 전에 이거 보세요'],
      humor: ['*{topic}* 검색만 하다 끝난 사람', '*{topic}*, 결론부터 말하면'],
    },
    body: [
      '좋았던 점은 *가격*과 *양*',
      '아쉬운 점은 *대기 시간*',
      '재방문 의사는 *반반*',
      '주말보다 *평일*이 낫습니다',
    ],
    cta: {
      cider: ['*평일*에 한 번 가보세요', '저장해두면 *다음에* 씀'],
      empathy: ['기대 *조금만* 낮추면 좋아요', '한 번은 *가볼 만* 해요'],
      humor: ['웨이팅은 *운동*이라 생각하기', '이거 보고 *판단*하세요'],
    },
  },
  issue: {
    hook: {
      cider: ['*{topic}*, 세 줄로 정리했습니다', '*{topic}* — 핵심만 뽑았습니다'],
      empathy: ['*{topic}*, 어렵지 않아요', '*{topic}*, 쉽게 정리했어요'],
      humor: ['*{topic}* 검색만 하다 끝난 사람', '*{topic}*, 아는 척용으로 저장'],
    },
    body: [
      '첫 번째는 *요금제* 변화',
      '두 번째는 *보안* 이슈',
      '세 번째는 *이용자* 반응',
      '결론은 *지켜보자*',
    ],
    cta: {
      cider: ['*세 줄*이면 충분합니다', '저장해두면 *다음에* 통함'],
      empathy: ['필요할 때 *꺼내* 보세요', '천천히 *알아가요*'],
      humor: ['이거 보고 *아는 척* 하세요', '저장 안 하면 *또* 검색'],
    },
  },
  it: {
    hook: {
      cider: ['*{topic}*, 이 네 줄이면 끝', '*{topic}* — 핵심만 정리'],
      empathy: ['*{topic}*, 어렵지 않아요', '*{topic}*, 처음엔 다 그래요'],
      humor: ['*{topic}* 검색만 하다 끝난 사람', '*{topic}*, 아는 척용으로 저장'],
    },
    body: [
      '*초안* 시키고 내가 고치기',
      '질문에 *조건*을 붙이기',
      '*로그인* 없이 써보게',
      '*개인정보* 수집은 최소로',
    ],
    cta: {
      cider: ['*저장*해두면 바로 씀', '이 네 줄이면 *대화* 됨'],
      empathy: ['하나씩 *익혀보세요*', '도구는 *쓰다 보면* 편해져요'],
      humor: ['저장만 하고 *안* 쓰죠?', '이거 보고 *아는 척* 하세요'],
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

/* ── 컷별 그림 지시(visual) ───────────────────────────────
 * AI가 없어도 컷마다 다른 장소·표정·동작·카메라를 골라
 * 모션 일러스트가 매번 새로 그려지게 합니다. */

const SCENE_POOL: Record<TemplateId, string[]> = {
  balance: ['사무실 책상 앞', '퇴근길 지하철', '노을 진 옥상', '회식 끝난 밤거리', '회의실 책상', '회사 탕비실'],
  living: ['자취방 주방', '원룸 창가', '동네 카페 창가', '장 보러 간 마트', '이사 첫날 빈방', '원룸 수납장 앞'],
  love: ['카페 창가 자리', '밤에 오가는 카톡', '비 오는 골목', '공원 벤치', '집 앞 편의점', '영화관 앞'],
  review: ['브런치 카페 창가', '줄 선 가게 앞', '집 현관 거실', '편의점 진열대 앞', '주방 식탁', '카페 카운터'],
  issue: ['모니터 앞 책상', '출근길 지하철', '뉴스 스튜디오', '회의실 스크린 앞', '늦은 밤 서재', '거리 전광판 아래'],
  it: ['모니터 앞 책상', '네온 빛 작업실', '출근길 지하철', '앱 화면 클로즈업', '늦은 밤 개발실', '발표 직전 회의실'],
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
  body: ['push-in', 'pan-left', 'pan-right', 'tilt-up', 'handheld'],
  cta: ['zoom-out', 'pan-left', 'handheld', 'tilt-up'],
};

const MOOD_POOL: Record<Tone, string[]> = {
  cider: ['tense', 'hype', 'bright', 'cold'],
  empathy: ['warm', 'dreamy', 'gloomy', 'bright'],
  humor: ['comic', 'hype', 'bright', 'tense'],
};

const VISUAL_RULES: { key: string; expression?: string; action?: string; props?: string[]; mood?: string; scene?: string }[] = [
  { key: '월급', expression: '지친', action: '지폐를 든', props: ['지폐', '시계'], mood: 'tense', scene: '사무실 책상 앞' },
  { key: '연봉', expression: '뿌듯한', action: '지폐를 든', props: ['지폐', '차트'], mood: 'bright' },
  { key: '칼퇴', expression: '웃는', action: '엄지 척', props: ['시계'], mood: 'bright', scene: '퇴근길 지하철' },
  { key: '야근', expression: '지친', action: '머리를 감싼', props: ['시계', '커피'], mood: 'gloomy', scene: '늦은 밤 사무실' },
  { key: '재택', expression: '무표정', action: '노트북을 보는', props: ['노트북'], mood: 'cold', scene: '원룸 창가' },
  { key: '자취', expression: '무표정', action: '손가락으로 짚는', props: ['화분', '커피'], mood: 'warm', scene: '자취방 주방' },
  { key: '월세', expression: '지친', action: '지폐를 든', props: ['지폐'], mood: 'tense' },
  { key: '고양이', expression: '웃는', action: '두 손을 벌린', props: ['고양이'], mood: 'warm' },
  { key: '소개팅', expression: '놀란', action: '휴대폰을 보는', props: ['휴대폰', '커피'], mood: 'comic', scene: '카페 창가 자리' },
  { key: '카톡', expression: '혼란스러운', action: '휴대폰을 보는', props: ['휴대폰'], mood: 'tense' },
  { key: '연애', expression: '시무룩한', action: '팔짱 낀', props: ['하트'], mood: 'gloomy' },
  { key: '썸', expression: '웃는', action: '두 손을 벌린', props: ['하트', '휴대폰'], mood: 'dreamy' },
  { key: 'AI', expression: '무표정', action: '노트북을 보는', props: ['노트북'], mood: 'cold', scene: '네온 빛 작업실' },
  { key: '앱', expression: '무표정', action: '손가락으로 짚는', props: ['노트북'], mood: 'cold' },
  { key: '출시', expression: '뿌듯한', action: '주먹 쥔', props: ['차트', '노트북'], mood: 'hype' },
  { key: '짜증', expression: '화난', action: '주먹 쥔', props: ['차트'], mood: 'tense' },
  { key: '최악', expression: '화난', action: '팔짱 낀', props: ['시계'], mood: 'tense' },
  { key: '돈', expression: '놀란', action: '지폐를 든', props: ['지폐'], mood: 'tense' },
  { key: '시간', expression: '지친', action: '머리를 감싼', props: ['시계'], mood: 'tense' },
  { key: '커피', expression: '무표정', action: '컵을 든', props: ['커피'], mood: 'warm', scene: '동네 카페 창가' },
];

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
  subtitle: string,
  topic: string,
  role: Shot['role'],
  rng: Rng,
  used: Set<string>,
): CutVisual {
  const text = `${subtitle} ${topic}`;
  const scenes = SCENE_POOL[template];
  const subjects = SUBJECT_POOL[template];
  const matched = VISUAL_RULES.filter((rule) => text.toLowerCase().includes(rule.key.toLowerCase()));
  const rule = matched.length ? rng.pick(matched) : null;

  const expressions = ['지친', '놀란', '무표정', '웃는', '비웃는', '혼란스러운'];
  const actions = ['손가락으로 짚는', '휴대폰을 보는', '두 손을 벌린', '팔짱 낀'];
  const expression =
    rule?.expression ??
    (role === 'cta' ? rng.pick(['웃는', '뿌듯한']) : role === 'hook' ? rng.pick(expressions) : rng.pick(['무표정', '지친', '비웃는']));
  const action = rule?.action ?? rng.pick(role === 'cta' ? ['엄지 척', '두 손을 벌린', '주먹 쥔'] : actions);
  const props = rule?.props ?? [rng.pick(DEFAULT_PROPS[template]), rng.pick(['시계', '화분', '커피', '휴대폰', '차트'])];

  const fresh = scenes.filter((candidate) => !used.has(candidate));
  const scene = rule?.scene && !used.has(rule.scene) ? rule.scene : rng.pick(fresh.length ? fresh : scenes);
  used.add(scene);

  return {
    scene,
    subject: rng.pick(subjects),
    expression,
    action,
    camera: rng.pick(CAMERA_POOL[role]),
    props: [...new Set(props)].slice(0, 3),
    mood: rule?.mood ?? rng.pick(MOOD_POOL[tone]),
  };
}

/** 주제 한 줄 → 6컷 쇼츠. 네트워크 없이 즉시 끝납니다. */
export function buildLocalShorts(input: BuildInput): Shorts {
  const template = TEMPLATE_MAP[input.template];
  const topic = input.topic.trim() || template.topics[0] || '새 쇼츠';
  const [a, b] = splitBalance(topic);
  const entry = findEntry(input.template, topic);
  const vars = { topic: clampText(topic, 24), a, b };
  const seed = newSeed();
  const rng = createRng(seed);
  const usedScenes = new Set<string>();

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
  const cuts: Shot[] = lines.slice(0, 6).map((line, index) => {
    const subtitle = fill(line, vars);
    return {
      id: `cut-${stamp}-${index}`,
      role: roleOf(index),
      emoji: template.cards[index] ?? '✨',
      subtitle,
      duration: CUT_DURATIONS[index] ?? 3,
      visual: pickVisual(input.template, input.tone, subtitle, topic, roleOf(index), rng, usedScenes),
    };
  });

  return {
    title,
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
    review: [
      '가게 앞이나 제품 클로즈업으로 시작. 결론을 먼저 던지기.',
      '첫인상 장면 — 플레이팅·패키지 클로즈업.',
      '아쉬웠던 지점을 같은 앵글로 다시.',
      '가격·양을 숫자로 보여주는 컷.',
      '다시 갈지 고민하는 표정.',
      '결론 한 줄과 저장 유도.',
    ],
    issue: [
      '뉴스 화면이나 모니터 클로즈업으로 시작. 숫자 하나를 크게.',
      '첫 번째 이슈 — 배경을 어둡게 두고 자막을 크게.',
      '두 번째 이슈로 전환. 화면 색온도를 바꿔 구분.',
      '세 번째 이슈는 짧게, 한 문장으로.',
      '영향을 받는 사람의 시선으로 한 컷.',
      '한 줄 요약과 저장 유도.',
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
