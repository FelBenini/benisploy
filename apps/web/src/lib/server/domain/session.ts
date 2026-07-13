export interface Session {
  id: string;
  userId: string;
  secretHash: Uint8Array;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionWithToken extends Session {
  token: string;
}

export function encodeSessionPublicJSON(session: Session): string {
  return JSON.stringify({
    id: session.id,
    user_id: session.userId,
    created_at: Math.floor(session.createdAt.getTime() / 1000),
    expires_at: Math.floor(session.expiresAt.getTime() / 1000),
  });
}
