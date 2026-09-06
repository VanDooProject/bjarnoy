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
| Fight simulator (`SimulatorView.vue`) | — (whole feature is premium) | Simulating at all | `Simulate` button disabled and a "Premium feature" card shown whenever `!auth.isPremium`, before any request |
| Army field order, standing (`ArmyPanel.vue` "Move on") | One destination click, no extra stops | Plotting more than one stop | `stores/world.ts`'s `addFieldOrderWaypoint` refuses a second point for a non-premium account, with `fieldOrderDraft.error` explaining why, instead of only failing at Confirm; the drafting form also states the free/premium split upfront |
| Army field order, mid-march (`ArmyPanel.vue` "Append goal") | — (redirecting a march in progress is always premium, per `Army.PlanFieldOrder`'s rule table) | Redirecting at all while still travelling | The row's field-order button is disabled (🔒, with a tooltip) for a non-premium account whenever the army hasn't arrived yet — `isFieldOrderMidMarch` in `lib/units/armyDispatch.ts` |
| Construction queue (`BuildingModal.vue`) | A free slot is open, or the account has a non-zero waiting queue | No free slot *and* `maxWaitingOrders === 0` (no waiting queue at all) | Build/Upgrade button disabled, with an inline note, whenever `noSlotNoQueue` is true |

## Why disabled-but-visible over other options considered

- **Hide the control entirely** — loses the upsell moment; a player who never sees the option never
  learns premium would unlock it.
- **Let it fail server-side, improve the error message** — this was the status quo; still costs a round
  trip and reads as "you did something wrong" rather than "this needs premium".
- **Disabled + lock + explanation (chosen)** — visible, honest about the restriction before any wasted
  effort, consistent with the one place this was already done right (`HexTooltip.vue`'s premium-locked
  scouting stats).
