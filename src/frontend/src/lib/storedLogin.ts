/** The refresh token's localStorage key, kept pinia-free so the landing intro can read it without loading the auth store. */
const REFRESH_TOKEN_KEY = 'bjarnoy.refreshToken';
/**
 * The name of the account the stored refresh token belongs to. A reload that finds the token rejected has no user loaded
 * yet, and the returning-player login gate needs this name to offer "log back in as …".
 */
const ACCOUNT_NAME_KEY = 'bjarnoy.accountName';

export function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function readStoredAccountName(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_NAME_KEY);
  } catch {
    return null;
  }
}

export function storeLogin(refreshToken: string, accountName: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(ACCOUNT_NAME_KEY, accountName);
}

export function clearStoredRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_NAME_KEY);
}
