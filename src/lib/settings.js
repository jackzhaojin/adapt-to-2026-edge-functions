// Demo settings. None of these are secrets. In a real deployment the values
// that differ per environment would come from the config store instead.

// OAuth client "adapt-to-2026-demo local edge" in Google Cloud. The client ID
// is public by design: it is the expected audience of every ID token we accept.
export const GOOGLE_CLIENT_ID = '629110387199-sqgbj6uhrdmahtin1ouu5dtjpeb8da3g.apps.googleusercontent.com';

// Path prefixes that require a signed-in visitor. Anonymous requests are sent
// to /auth/login and come back here afterwards.
export const PROTECTED_PATHS = ['/ai-articles/'];

// First-party API the edge calls on the visitor's behalf. Locally this is the
// mock server in local-only/2026-09-19-edge-functions/mock-api. The backend name
// must exist in fastly.toml for `serve`; in the cloud it would be declared under
// `origins` in config/edgeFunctions.yaml.
export const TRAILS_API_URL = 'http://127.0.0.1:9000';
export const TRAILS_API_BACKEND = 'mock-api';
