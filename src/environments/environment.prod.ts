export const environment = {
  production: true,
  userPoolId: '',
  userPoolClientId: '',
  identityPoolId: '',
  region: '',
  googleClientId: '',
  apiUrl: '',
  webSocketUrl: '',
  cognitoDomain: '',
  redirectSignIn: '',
  redirectSignOut: '',

  globalGivingApiKey: '',
  globalGivingApiUrl: '',
  donation: {
    defaultLimit: 20,
    maxLimit: 50,
    cacheTimeout: 300,
    minDonationAmount: 1000,
    maxDonationAmount: 100000,

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

    supportedCountries: [
      'US', 'KR', 'JP', 'CN', 'IN', 'TH', 'VN', 'PH', 'ID', 'MY',
      'SG', 'BD', 'NP', 'LK', 'MM', 'KH', 'LA', 'BT', 'MV', 'BN'
    ]
  }
};