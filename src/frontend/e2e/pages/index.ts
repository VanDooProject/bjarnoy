/**
 * Page objects for the Playwright suite (issue #189).
 *
 * Specs import from here: `import { SettlementPage } from './pages'`.
 * `fixtures.ts` is the one exception — it imports
 * `./pages/AdminAuthFixture` directly, because importing this barrel would
 * pull in modules that import `fixtures.ts` back.
 */
export { ADMIN_USER, AdminAuthFixture, type SessionUser } from './AdminAuthFixture';
export { AdminActivityPage, type ActivityBucket, type ActivityUser } from './AdminActivityPage';
export { AdminSettlementsPage } from './AdminSettlementsPage';
export { AdminTablePage } from './AdminTablePage';
export { RingMenuComponent } from './RingMenuComponent';
export { ScrollableView } from './ScrollableView';
export {
  SettlementPage,
  type HexCoord,
  type HexQuery,
  type HexTarget,
  type ScreenPoint,
} from './SettlementPage';
export { WorldMapPage } from './WorldMapPage';
