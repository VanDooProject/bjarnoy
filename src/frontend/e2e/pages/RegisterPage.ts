import { expect, type Locator, type Page, type Route } from '@playwright/test';

/** The player id the register flow claims the anonymous settlement with (`bjarnoy.playerId`). */
export const REGISTER_PLAYER_ID = 'player_11111111-1111-1111-1111-111111111111';

/** The account `/auth/register` answers with in the mocked flow. */
export const REGISTERED_USER = { id: 'u-1', userName: 'newjarl', role: 'player', status: 'active', displayName: null };

/** What the register request carried. */
export interface RegisterRequest {
  userName: string;
  password: string;
  existingOwnerId: string | null;
}

/**
 * The two account pages, `/register` and `/login`, which link to each other. Demo mode has no backend
 * behind it, so the register flow mocks `/auth/register` with `mockRegister`.
 */
export class RegisterPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly userName: Locator;
  readonly password: Locator;
  readonly confirmPassword: Locator;
  readonly submitButton: Locator;
  readonly toLoginLink: Locator;
  readonly toRegisterLink: Locator;

  /** The register request the page sent, once `mockRegister` is set up and the form submitted. */
  request: RegisterRequest | undefined;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.userName = page.getByLabel('Username');
    this.password = page.getByLabel('Password', { exact: true });
    this.confirmPassword = page.getByLabel('Confirm password');
    this.submitButton = page.getByRole('button', { name: 'Create account' });
    this.toLoginLink = page.getByRole('button', { name: 'Already have an account? Log in' });
    this.toRegisterLink = page.getByRole('button', { name: 'Playing anonymously? Create an account' });
  }

  /** Opens `/register` (optionally with a redirect target) and waits for its heading. */
  static async openRegister(page: Page, redirect?: string): Promise<RegisterPage> {
    await page.goto(redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register');
    const register = new RegisterPage(page);
    await expect(register.heading).toBeVisible();
    return register;
  }

  /** Opens `/login` and waits for its form. */
  static async openLogin(page: Page): Promise<RegisterPage> {
    await page.goto('/login');
    const login = new RegisterPage(page);
    await expect(login.toRegisterLink).toBeVisible();
    return login;
  }

  /** Gives the page the anonymous player id a register claims the local settlement with. */
  static async seedPlayerId(page: Page): Promise<void> {
    await page.addInitScript((id) => localStorage.setItem('bjarnoy.playerId', id), REGISTER_PLAYER_ID);
  }

  /** Answers `/auth/register` with a new session and records what it was sent. */
  async mockRegister(): Promise<void> {
    await this.page.route('**/api/v1/auth/register', (route: Route) => {
      this.request = route.request().postDataJSON();
      return route.fulfill({
        json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: REGISTERED_USER },
      });
    });
  }

  async fill(userName: string, password: string, confirmPassword: string): Promise<void> {
    await this.userName.fill(userName);
    await this.password.fill(password);
    await this.confirmPassword.fill(confirmPassword);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
