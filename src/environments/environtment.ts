export const environment = {
  production: false,
  userPoolId: '',
  userPoolClientId: '',
  identityPoolId: '',
  region: 'ap-northeast-2',
  googleClientId: '',
  apiUrl: 'http://localhost:3000',
  cognitoDomain: '',
  redirectSignIn: '',
  redirectSignOut: ''
};

export const matchingGroup = [
  {
    name: '건강',
    emoji: '🏃‍♀️',
    description: '',
    memberCount: 0,
    activeToday: 0,
    achievementRate: 0,
    rating: 0,
    clubList: [
      {
        id: '0',
        name: '동네탐험대',
        icon: '🚶‍♀️',
        description: '오늘도 우리 동네 숨은 보물을 찾아 떠나는 20분 모험!',
        members: 0
      },
      {
        id: '1',
        name: '베개와의 약속',
        icon: '⏰',
        description: '시계보다 정확한 내 몸의 리듬을 만드는 수면 마스터',
        members: 0
      },
      {
        id: '2',
        name: '물방울 충전소',
        icon: '🌊',
        description: '몸속 배터리를 깨끗한 물로 매일 풀충전하는 전문가',
        members: 0
      },
      {
        id: '3',
        name: '뼈마디 깨우기',
        icon: '🦴',
        description: '굳어진 근육에 마법을 걸어 부드럽게 만드는 요정',
        members: 0
      },
      {
        id: '4',
        name: '비타민 사냥꾼',
        icon: '🍎',
        description: '자연이 숨겨둔 영양보물을 매일 찾아 먹는 헌터',
        members: 0
      },
      {
        id: '5',
        name: '내면 충전기',
        icon: '🕯️',
        description: '마음의 배터리를 조용히 충전하는 평온 발전소',
        members: 0
      },
      {
        id: '6',
        name: '치아 청소부',
        icon: '🧵',
        description: '양치 후 1분간 잇몸 사이를 깨끗하게 관리하는 구강 관리사',
        members: 0
      },
      {
        id: '7',
        name: '영양 충전소',
        icon: '💊',
        description: '매일 약물로 몸을 보호하는 24시간 보안 서비스'
      },
      {
        id: '8',
        name: '건강 레이더',
        icon: '📈',
        description: '내 몸의 변화를 기록으로 추적하는 조기경보 시스템',
        members: 0
      },
      {
        id: '9',
        name: '전자기기 금지구역',
        icon: '📱',
        description: '전자기기 없이 온전히 나만의 시간을 즐기는 아날로그 타임',
        members: 0
      }
    ],
    tags: ['절약', '건강', '생활습관', '무료활동']
  },
  {
    name: "금융",
    emoji: "💰",
    description: "돈 관리의 달인이 되는 스마트한 습관들",
    memberCount: 0,
    activeToday: 0,
    achievementRate: 0,
    rating: 0,
    club: [
      {
        id: "0",
        name: "월급 도둑",
        icon: "🏦",
        description: "월급날마다 몰래 저축통으로 돈을 훔쳐가는 자동 시스템",
        members: 0
      },
      {
        id: "1", 
        name: "가계부 탐정",
        icon: "🔍",
        description: "하루 5분, 돈의 행방을 추적하는 지출 수사관",
        members: 0
      },
      {
        id: "2",
        name: "일요일 회계사", 
        icon: "📊",
        description: "매주 일요일 21시, 가계 재정을 점검하는 예산 전문가",
        members: 0
      },
      {
        id: "3",
        name: "24시간 냉정기",
        icon: "❄️", 
        description: "충동구매 욕구를 하루 동안 얼려서 현명한 선택을 돕는 쿨링 시스템",
        members: 0
      },
      {
        id: "4",
        name: "봉투 마법사",
        icon: "✉️",
        description: "현금 봉투로 지출 한도를 마법처럼 관리하는 예산 마술사", 
        members: 0
      },
      {
        id: "5",
        name: "빚 퇴치단",
        icon: "⚔️",
        description: "고금리부터 차근차근 갚아서 부채를 물리치는 용감한 전사",
        members: 0
      },
      {
        id: "6", 
        name: "미래 저금통",
        icon: "🎯",
        description: "매월 정해진 날, 미래를 위해 꾸준히 투자하는 시간 여행자",
        members: 0
      },
      {
        id: "7",
        name: "든든한 방패막이",
        icon: "🛡️",
        description: "3-6개월 생활비로 위기상황을 막아내는 최후의 보루",
        members: 0
      },
      {
        id: "8",
        name: "결제 로봇",
        icon: "🤖",
        description: "반복되는 납부를 자동화해서 깜빡함 없이 처리하는 AI 비서",
        members: 0
      },
      {
        id: "9",
        name: "돈 새는 곳 막기단",
        icon: "🔧",
        description: "월말 15분으로 불필요한 구독과 수수료 누수를 찾아 막는 수리공",
        members: 0
      }
    ],
    tags: ["절약", "투자", "예산관리", "자동화"]
  },
  {
    name: "스킨케어",
    emoji: "✨",
    description: "안팎으로 빛나는 피부를 만드는 뷰티 루틴",
    memberCount: 0,
    activeToday: 0,
    achievementRate: 0,
    rating: 0,
    club: [
      {
        id: "0",
        name: "햇빛 방패단",
        icon: "☀️",
        description: "아침 세안 후 선크림으로 자외선을 차단하는 피부 보안관",
        members: 0
      },
      {
        id: "1", 
        name: "얼굴 세탁소",
        icon: "🧼",
        description: "퇴근 후 60초간 하루 쌓인 먼지를 깔끔하게 세탁하는 클렌징 전문가",
        members: 0
      },
      {
        id: "2",
        name: "수분 충전기", 
        icon: "💧",
        description: "샤워 후 촉촉한 보습으로 피부 장벽을 튼튼하게 만드는 수분 공급소",
        members: 0
      },
      {
        id: "3",
        name: "밤의 재생공장",
        icon: "🌙", 
        description: "저녁에 레티노이드로 잠든 사이 피부를 새롭게 만드는 야간 근무자",
        members: 0
      },
      {
        id: "4",
        name: "아침 비타민 폭탄",
        icon: "🍊",
        description: "비타민 C 세럼으로 하루를 환하게 시작하는 안티에이징 전사", 
        members: 0
      },
      {
        id: "5",
        name: "피부 리셋 버튼",
        icon: "🔄",
        description: "주 1-3회 각질 케어로 피부를 새로고침하는 리뉴얼 전문가",
        members: 0
      },
      {
        id: "6", 
        name: "트러블 119",
        icon: "🚨",
        description: "운동 후 즉시 미온수로 트러블을 예방하는 응급처치팀",
        members: 0
      },
      {
        id: "7",
        name: "수염 정원사",
        icon: "🪒",
        description: "샤워 후 면도와 보습으로 수염을 가꾸는 그루밍 마스터",
        members: 0
      },
      {
        id: "8",
        name: "뷰티 슬립 모드",
        icon: "😴",
        description: "밤 11시 전자기기 OFF로 피부 재생을 돕는 수면 매니저",
        members: 0
      },
      {
        id: "9",
        name: "속부터 빛나기",
        icon: "💎",
        description: "식사 후 물 1컵으로 내부부터 촉촉하게 만드는 이너뷰티 케어",
        members: 0
      }
    ],
    tags: ["뷰티", "안티에이징", "셀프케어", "건강한피부"]
  }
]

export const matchingGroupTable: { [key: string]: number} = {
  '건강': 0,
  '금융': 1,
  '스킨케어': 2
}