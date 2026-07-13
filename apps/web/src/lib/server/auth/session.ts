import type { Session, SessionWithToken } from "../domain/session";
import type { SessionRepository } from "../ports/repository";

export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24; // 1 day
export const SESSION_COOKIE = "session_token";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const RANDOM_BYTES_COUNT = 24;
const SHIFT_AMOUNT = 3;

export function generateSecureRandomString(): string {
  const bytes = new Uint8Array(RANDOM_BYTES_COUNT);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += ALPHABET[bytes[i] >> SHIFT_AMOUNT];
  }
  return result;
}

export function generateSessionToken(): string {
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  return `${id}.${secret}`;
}

export function parseSessionToken(token: string): {
  sessionId: string;
  secret: string;
} | null {
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return null;
  }
  return { sessionId: parts[0], secret: parts[1] };
}

export async function hashSecret(secret: string): Promise<Uint8Array> {
  const secretBytes = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  return new Uint8Array(hashBuffer);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

export async function createSession(
  sessionRepo: SessionRepository,
  userId: string,
): Promise<SessionWithToken> {
  const now = new Date();
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);
  const token = `${id}.${secret}`;

  const session: Session = {
    id,
    userId,
    secretHash,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_EXPIRES_IN_SECONDS * 1000),
  };

  await sessionRepo.create(session);

  return { ...session, token };
}

export async function validateSessionToken(
  sessionRepo: SessionRepository,
  token: string,
): Promise<Session | null> {
  const parsed = parseSessionToken(token);
  if (!parsed) {
    return null;
  }

  const session = await sessionRepo.get(parsed.sessionId);
  if (!session) {
    return null;
  }

  if (new Date() >= session.expiresAt) {
    await sessionRepo.delete(session.id);
    return null;
  }

  const tokenSecretHash = await hashSecret(parsed.secret);
  if (!constantTimeEqual(tokenSecretHash, session.secretHash)) {
    return null;
  }

  return session;
}

export async function deleteSession(
  sessionRepo: SessionRepository,
  sessionId: string,
): Promise<void> {
  await sessionRepo.delete(sessionId);
}

export function verifyRequestOrigin(
  originHeader: string | null,
  hostHeader: string | null,
): boolean {
  if (originHeader === null || hostHeader === null) {
    return false;
  }
  try {
    const originUrl = new URL(originHeader);
    return originUrl.host === hostHeader;
  } catch {
    return false;
  }
}
