import { google } from 'googleapis';

type ServiceAccountKey = {
  type: 'service_account';
  client_email: string;
  private_key: string;
  project_id?: string;
};

let cachedServiceAccountKey: ServiceAccountKey | null = null;
let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;
let cachedDrive: ReturnType<typeof google.drive> | null = null;
let cachedSlides: ReturnType<typeof google.slides> | null = null;

function parseServiceAccountKey(rawKey: string): ServiceAccountKey {
  const cleaned = rawKey.trim().replace(/^['"]|['"]$/g, '');
  const parsed = JSON.parse(cleaned) as Partial<ServiceAccountKey>;
  const normalizedClientEmail =
    typeof parsed.client_email === 'string'
      ? parsed.client_email.replace(/^\[([^\]]+)\]\(mailto:[^)]+\)$/i, '$1').trim()
      : '';
  const normalizedPrivateKey =
    typeof parsed.private_key === 'string'
      ? parsed.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim()
      : '';

  if (!normalizedClientEmail || !normalizedPrivateKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key');
  }

  if (
    cleaned.includes('YOUR_PRIVATE_KEY_HERE') ||
    cleaned.includes('your-project-id') ||
    cleaned.includes('your-service-account@')
  ) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is still using sample placeholder values. Paste the real Google service account JSON into the environment variable.'
    );
  }

  if (
    !normalizedPrivateKey.includes('-----BEGIN PRIVATE KEY-----') ||
    !normalizedPrivateKey.includes('-----END PRIVATE KEY-----')
  ) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY contains an invalid private key. Paste the full real service-account JSON from Google Cloud.'
    );
  }

  return {
    type: 'service_account',
    client_email: normalizedClientEmail,
    private_key: normalizedPrivateKey,
    project_id: parsed.project_id,
  };
}

function buildServiceAccountKey(): ServiceAccountKey {
  if (cachedServiceAccountKey) {
    return cachedServiceAccountKey;
  }

  const rawJsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (rawJsonKey) {
    cachedServiceAccountKey = parseServiceAccountKey(rawJsonKey);
    return cachedServiceAccountKey;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing Google service account configuration. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.'
    );
  }

  cachedServiceAccountKey = {
    type: 'service_account',
    client_email: clientEmail,
    private_key: privateKey,
  };

  return cachedServiceAccountKey;
}

export function getGoogleAuth() {
  if (cachedAuth) {
    return cachedAuth;
  }

  const serviceAccountKey = buildServiceAccountKey();

  cachedAuth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  console.log('Google auth initialized for service account:', serviceAccountKey.client_email);

  return cachedAuth;
}

export function getGoogleDrive() {
  if (cachedDrive) {
    return cachedDrive;
  }

  cachedDrive = google.drive({
    version: 'v3',
    auth: getGoogleAuth(),
  });

  return cachedDrive;
}

export function getGoogleSlides() {
  if (cachedSlides) {
    return cachedSlides;
  }

  cachedSlides = google.slides({
    version: 'v1',
    auth: getGoogleAuth(),
  });

  return cachedSlides;
}

export function getGoogleServiceAccountInfo() {
  const key = buildServiceAccountKey();

  return {
    clientEmail: key.client_email,
    projectId: key.project_id || '',
  };
}
