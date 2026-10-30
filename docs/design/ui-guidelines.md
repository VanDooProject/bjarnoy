# UI guidelines

Rules every UI change has to meet. They exist because the same kinds of leftovers kept piling up and needed
dedicated cleanup passes (see "Where these came from" at the bottom). Apply them **in the same PR as the change
that touches the UI** — when you change a flow, check the surfaces around it against this list and clean up what
the change made stale. Don't defer it to a later cleanup.

## 1. No leftover actions

- Every button must do something that can succeed for the player who sees it. A button that can only fail
  (wrong terrain, demo-only type, a code path the backend doesn't have) is removed, not left with an error
  message behind it.
- When an action moves to a new place (e.g. building moved from the details modal to the ring menu), the old
  entry point is removed in the same change, together with its handler, i18n keys and tests. The old place may
  point to the new one in one line; it doesn't keep a second, older implementation.
- Info-only surfaces stay info-only: a details modal for an empty tile shows what the tile is, not a
  half-working build form.

## 2. No links back into finished flows

- Navigation only offers places that make sense in the player's current state. Once onboarding has started /
  a settlement is founded, the landing page is not a destination anymore and isn't linked.
- Visibility rules for a nav entry live in one place (store getter / computed) and every nav surface (desktop
  nav, mobile drawer, menus) reads that same rule.

## 3. Screen space is for the game

- On phones, every band of chrome has to carry information or controls the player needs right now. Rows that
  repeat known context (sea name, decorative footers) are dropped, not shrunk.
- No full-width bars for a single control: one trigger floats as a chip; the map uses the rest.
- When chrome is removed, the space reserved for it goes too (offsets, insets, CSS vars like
  `--hud-inset-*`) — nothing stays docked "above the footer" that no longer exists.

## 4. Safe areas and viewport edges

- Floating chrome and popovers respect `env(safe-area-inset-*)` and keep a 16px side gutter at phone width.
- Popovers/nudges anchored to a trigger are clamped to the viewport; nothing is cut off by the status bar or
  the screen edge. Check at 360×740 and 390×844 with a simulated top inset.

## 5. Everything that appears also leaves animated

- Any element with an enter animation also has a leave animation — including when it unmounts because its data
  ran out (a queue emptying, the last order finishing), not only on explicit close.
- A bare `v-if` on a HUD element that animates elsewhere is a bug. Wrap it in the shared `<Transition>` / leave
  hook that element already uses.
- All motion goes through the per-device animation settings / reduced-motion gate; with motion off, things
  appear and disappear instantly — the same code path, just with zero duration.

## 6. One implementation per behaviour

- The same component used in two views (e.g. the ring menu on the onboarding page and on the map) gets its
  mounting, open/close animation and gesture handling from one shared place (the component itself, a wrapper
  component or a composable). Don't re-wire it per view, and don't copy a fix into the second view — move it
  to the shared place so both views get it.
- If you find two diverging implementations of one behaviour, unify them as part of your change (or open a
  task for it if it's out of scope).

## 7. Touch first on mobile

- Gestures the UI suggests (a pull handle, a drawer, a swipe-able sheet) must work with real touch input on a
  phone, not just tap or mouse drag. Drag surfaces set `touch-action` so the browser doesn't claim the gesture.
- Verify gestures with real touch events (Playwright + CDP `Input.dispatchTouchEvent`, `hasTouch`/`isMobile`),
  not synthetic `dispatchEvent` pointer events.

## Checklist for a UI PR

- [ ] No button left that can only fail; moved actions removed from their old place (handler, i18n, tests).
- [ ] Nav entries match the player's state; the rule lives in one place.
- [ ] No chrome without information on phones; reserved space for removed chrome is gone.
- [ ] Safe areas and 16px gutters respected; popovers fully on-screen at 360×740 and 390×844.
- [ ] Every enter has a leave, including data-driven unmounts; motion goes through the motion setting.
- [ ] Shared components share their mount/animation/gesture code across views.
- [ ] Gestures tested with real touch input on a mobile viewport.
- [ ] Phone screenshots in the PR.

## Where these came from

The October 2026 mobile cleanup pass: a "Build here" button on empty tiles that queued a demo-only hut and could
only fail; a "Landing" link still offered after founding; a footer row (sea name + plot countdown) eating the
bottom of the onboarding screen; a full-width header bar holding only the "Name your jarl" trigger, clipped by
the status bar; the queue side handle vanishing instead of sliding out; the ring menu closing without animation
on the onboarding page because that view mounted it differently from the map; and the mobile top drawer opening
only by tap, not by dragging.
