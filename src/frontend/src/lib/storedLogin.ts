/** The refresh token's localStorage key, kept pinia-free so the landing intro can read it without loading the auth store. */
const REFRESH_TOKEN_KEY = 'bjarnoy.refreshToken';

export function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearStoredRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
