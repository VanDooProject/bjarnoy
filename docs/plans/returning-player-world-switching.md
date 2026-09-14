# Returning-player nav: login, world switching, and account scope

Design notes captured from product direction on PR #235 (`ReturningPlayerMenu.vue`,
`WorldPickerView.vue`) — the entry point that replaced the anonymous avatar in
`HudNav.vue` and PR #232's pre-founding "I already have a realm" link.

## Shipped in #235

- The returning-player trigger (`HudNav.vue` for founded/in-game views,
  `LandingView.vue` pre-founding) opens a dropdown, not a full-page navigation.
- Clicking a world row joins/returns to it directly — no intermediate
  "Join another world" menu step. (See the "one fewer click" note below —
  this was a direct revision of the first shipped version, which *did* have
  that intermediate step.)
- A world switch never abandons the settlement you're leaving — the backend
  already scopes one settlement per `(worldId, ownerId)`, and the client
  tracks `settlementsByWorld` locally so returning to a world you'd already
  founded in restores it rather than starting over.

## Click-count decision: merge the dropdown into the world list directly

First shipped version: trigger → 2-row menu (Log in / Join another world) →
world list → pick a row. Three clicks to switch worlds, which is the common
case this control exists for.

Revised: trigger → world list directly. Two clicks. "Log in" stays reachable
from the same panel, not nested behind another click — it just isn't the
first thing the panel shows, since picking a world is the more frequent
action.

## Login ↔ world linkage

Right now, logging in is explicit per world: picking "log in" in the context
of a specific world (a world row an anonymous visitor doesn't yet have a
realm in) carries that world along to `/login`, and the login page offers to
found a settlement there immediately after authenticating — instead of
logging in generically and having to navigate back to the world list
afterward to finish what you came to do.

## Explicitly out of scope for now (future direction, not built)

- **Shared credentials across worlds, and eventually SSO / multi-tenant.**
  One account should eventually be able to carry across every world a
  player has access to (and, further out, an internal SSO login and
  multi-tenant account model) rather than treating each world as a fully
  separate identity. The per-world explicit login above is today's simpler
  stand-in for that, not the intended end state — don't read the current
  `?worldId=` query-param linkage as the permanent shape of this; it's
  scoped to get the immediate UX right without committing to an account
  architecture that hasn't been designed yet.

## Scope note: this is not the admin world switcher

The admin panel (`AdminWorldsView.vue`) has its own always-visible,
persistent world switcher — that's a different UI for a different audience
(admins managing multiple worlds at once) and is not the model for this
control. The returning-player world list stays behind the existing
click-triggered dropdown; it should not become a second, permanently-visible
switcher living in the header on every page. If a persistent switcher is
ever wanted for regular players, that's a separate decision, not an
extension of this dropdown.
