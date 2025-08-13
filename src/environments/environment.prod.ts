export const environment = {
  production: true,
  userPoolId: '',
  userPoolClientId: '',
  identityPoolId: '',
  region: 'ap-northeast-2',
  googleClientId: '',
  apiUrl: 'http://localhost:3000',
  webSocketUrl: 'http://localhost:9001',
  cognitoDomain: '',
  redirectSignIn: '',
  redirectSignOut: '',

  globalGivingApiKey: '178b5732-efbc-44e9-9113-7eaafcf08357',
  globalGivingApiUrl: 'https://api.globalgiving.org/api/public/projectservice',

  donation: {
    defaultLimit: 20,           // 기본 프로젝트 조회 개수
    maxLimit: 50,              // 최대 프로젝트 조회 개수
    cacheTimeout: 300,         // 캐시 유효 시간 (초)
    minDonationAmount: 1000,   // 최소 기부 금액 (포인트)
    maxDonationAmount: 100000, // 최대 기부 금액 (포인트)
    
    // 카테고리 매핑
    categoryMapping: {
      'education': '교육지원',
      'health': '의료지원',
      'water': '국제개발',
      'animals': '동물보호',
      'disaster': '재해구호',
      'elderly': '노인복지',
      'disability': '장애인복지',
      'environment': '환경보호',
      'default': '기타'
    },
    
    // 지원 가능한 테마 목록 (GlobalGiving API 기준)
    supportedThemes: [
      'education',
      'health',
      'water',
      'animals',
      'disaster',
      'elderly',
      'disability',
      'environment',
      'agriculture',
      'human-rights',
      'economic-development'
    ],
    
    // 지원 가능한 국가 코드 (ISO 3166)
    supportedCountries: [
      'US', 'KR', 'JP', 'CN', 'IN', 'TH', 'VN', 'PH', 'ID', 'MY',
      'SG', 'BD', 'NP', 'LK', 'MM', 'KH', 'LA', 'BT', 'MV', 'BN'
    ]
  }
};