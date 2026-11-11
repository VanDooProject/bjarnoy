# Building HUD (settlement view)

- Every own building shows a hex dial with its level. The ring shows the upgrade state: green = can upgrade, red = cannot
  (short of resources, Longhouse cap, missing prerequisite, storage cap), yellow arc = upgrade running (time left inside),
  gold number with a full gold ring = max level.
- Only a maxed Longhouse shows the crown.
- The time until a short-of-resources upgrade becomes affordable is a premium feature. Free accounts see only that
  resources are short.
- The dial scales with the map like the construction dial and sits at the same height above its tile. Zoomed out far
  enough that the construction dial drops its time, the dial is empty: ring only, no number, no box.
- Next to the dial a box shows the details. Near zoom: up to three rows (upgrade state, production or Town Square feast,
  garrison troop types, training queue). Mid zoom: two rows.
- Bridges get a dial; wall pieces do not.
- The Longhouse drops its production row while troops are garrisoned there.
- Up to three missing prerequisites are listed; from four on, two are listed plus "+n more".
- Overlapping markers stack left to right: the right-most is on top. Hovering or tapping a marker brings it to the front,
  enlarged.
- The building info can be switched off (icon button at the top left of the map, or H). While it is on, the building's own
  dial shows every order on an existing building: running upgrade, waiting (`#place`), just clicked (sweep and dots),
  refused (red flash and cross), raze and the finish animation. A construction dial on a hex without a marker (a new build
  with no building standing yet, a wall) is a dial-only marker: just the dial, placed, scaled, hovered, tapped and faded
  under the ring menu like every marker. With the info off every construction dial is a dial-only marker, and the
  dial-only markers do not depend on the switch. The countdown turns yellow in its last minute. Switching the info on or
  off hands each hex over marker by marker, so a hex always shows exactly one dial. The map canvas draws no construction
  dial itself; the landing page's live settlement preview shows its dial-only markers too (no building markers there).
- Markers never take mouse or touch input: hover, taps, wheel and drags go to the map under them like on any tile. A marker
  grows when the mouse is on its dial or its hex, or when a touch taps its dial (the tap still reaches the map). The box
  text stands on its own, there are no tooltips on it.
