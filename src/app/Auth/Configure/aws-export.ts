const awsmobile = {
  Auth: {
    Cognito: {
      userPoolId: '',
      userPoolClientId: '',
      signUpVerificationMethod: 'code' as const,
      loginWith: {
        email: true
      },
      userDeletion: '',
    },
    identityPoolId: ''
  }
};

export default awsmobile;