/**
 * Constants of the ALFA_ROMEO_EU configuration, copied from the public project
 * https://github.com/hass-uconnect/py-uconnect (brands.py, auth.py, _http.py).
 * The keys are the public ones of the official web portal, not secrets of the owner.
 */

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const GIGYA_PARAMS = {
  targetEnv: 'jssdk',
  loginMode: 'standard',
  sdk: 'js_latest',
  authMode: 'cookie',
  sdkBuild: '12234',
  format: 'json',
};

export const JWT_FIELDS = 'profile.firstName,profile.lastName,profile.email,country,locale,data.disclaimerCodeGSDP';

export const ALFA_ROMEO_EU = {
  region: 'eu-west-1',
  loginApiKey: '3_h8sj2VQI-KYXiunPq9a1QuAA4yWkY0r5AD1u8A8B1RPn_Cvl54xcoc2-InH5onJ1',
  loginUrl: 'https://login.alfaromeo.com',
  tokenUrl: 'https://authz.sdpr-01.fcagcv.com/v2/cognito/identity/token',
  apiUrl: 'https://channels.sdpr-01.fcagcv.com',
  apiKey: '2wGyL6PHec9o1UeLPYpoYa1SkEWqeBur9bLsi24i',
  // PIN authentication host (MFA), py-uconnect brands.py MFA_EU.
  mfaUrl: 'https://mfa.fcl-01.fcagcv.com',
  mfaKey: 'JWRYW7IYhW9v0RqDghQSx4UcRYRILNmc8zAuh5ys',
  locale: 'de_de',
  brandCode: 'ALFAROMEO',
} as const;

export const REQUEST_TIMEOUT_MS = 20_000;
