# Premium-gating UX: deny upfront, not after the click

**Status:** implemented — fight simulator, army field orders, construction queue.

## The problem

Three separate premium-only actions (the fight simulator, waypointed/mid-march army field orders, and
"queue build" when every construction slot is busy) all had the same shape of bug: a non-premium player
could fill in a form, click the action button, and only then learn — via a 403 or a rejection detail
string — that the account isn't premium. The action was never visually distinguished from a free one
beforehand, so the frustration was doing the work and getting blocked, not being told no in advance.

## The rule

**Every premium-gated action must be visually distinguished and non-actionable for a non-premium account
before the click, not after.** Concretely:

- The control (button) is disabled, not hidden — hiding it entirely removes the chance to notice premium
  exists at all (see `HexTooltip.vue`'s scouted-hex stats for the existing example this follows).
- A lock affordance (icon and/or label change) and a short inline explanation sit next to the disabled
  control, stating what premium would unlock — not just "no".
- The 403/409 rejection path is kept as a defensive fallback for a stale client-side flag (e.g. premium
  revoked mid-session), never as the primary way a player learns about the restriction.

This needs a client-side premium flag to gate on, which didn't exist before this pass:
`UserResponse.IsPremium` (`AuthContracts.cs`) is now sent on `/auth/me`, `/auth/login`, etc., and read via
`useAuthStore().isPremium` (`stores/auth.ts`).

## Where it's applied

| Action | Free case | Premium-only case | Where the gate lives |
| --- | --- | --- | --- |
| Fight simulator (`SimulatorView.vue`) | — (whole feature is premium) | Simulating at all | A "Premium feature" card is shown whenever `!auth.isPremium`, before any request — **advisory only**, the button itself stays clickable (see note below) |
| Army field order, standing (`ArmyPanel.vue` "Move on") | One destination click, no extra stops | Plotting more than one stop | `stores/world.ts`'s `addFieldOrderWaypoint` refuses a second point for a non-premium account, with `fieldOrderDraft.error` explaining why, instead of only failing at Confirm; the drafting form also states the free/premium split upfront |
| Army field order, mid-march (`ArmyPanel.vue` "Append goal") | — (redirecting a march in progress is always premium, per `Army.PlanFieldOrder`'s rule table) | Redirecting at all while still travelling | The row's field-order button is disabled (🔒, with a tooltip) for a non-premium account whenever the army hasn't arrived yet — `isFieldOrderMidMarch` in `lib/units/armyDispatch.ts` |
| Construction queue (`BuildingModal.vue`) | A free slot is open, or the account has a non-zero waiting queue | No free slot *and* `maxWaitingOrders === 0` (no waiting queue at all) | Build/Upgrade button disabled, with an inline note, whenever `noSlotNoQueue` is true |

## The one exception: the simulator's flag can't be trusted enough to hard-block

`PremiumUserEndpointFilter` checks `IsPremium` live against the database on every request rather than
a token claim — deliberately, so an admin granting premium takes effect on an already-logged-in
account's very next click, with no re-login needed (`PremiumSimulatorTests` exercises exactly this).
`auth.user`, though, is only ever a login-time snapshot with nothing that refreshes it mid-session. If
`Simulate` were hard-disabled on `!auth.isPremium` the way the other two actions are, a legitimately
just-upgraded account would find its *own stale client flag* permanently blocking the one button that
could still succeed — worse than the original click-then-reject behavior, not better.

So for the simulator specifically, the "Premium feature" card is advisory only: it still tells the
player upfront what a non-premium account should expect, but the button stays clickable, and a
successful response self-heals the stale flag (`auth.user.isPremium = true`) so the notice clears
without a page reload. The other two actions don't have this problem — their gating data
(`world.hud.construction.maxWaitingOrders`, the field order draft's own route) is refreshed by the
same live poll/action flow the rest of the HUD already relies on, not a stale login-time snapshot.

## Why disabled-but-visible over other options considered

- **Hide the control entirely** — loses the upsell moment; a player who never sees the option never
  learns premium would unlock it.
- **Let it fail server-side, improve the error message** — this was the status quo; still costs a round
  trip and reads as "you did something wrong" rather than "this needs premium".
- **Disabled + lock + explanation (chosen)** — visible, honest about the restriction before any wasted
  effort, consistent with the one place this was already done right (`HexTooltip.vue`'s premium-locked
  scouting stats).
