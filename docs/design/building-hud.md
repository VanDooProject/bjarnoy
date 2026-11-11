# Building HUD (settlement view)

- Every own building shows a hex dial with its level. The ring shows the upgrade state: green = can upgrade, red = cannot
  (short of resources, Longhouse cap, missing prerequisite, storage cap), yellow arc = upgrade running (time left inside),
  gold number with a full gold ring = max level.
- When an upgrade's time is up, the dial shows no colour and no number until the new level arrives.
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
- The building info can be switched off (icon button: on desktop the top icon of the panel column at the map's bottom left, on
  phones at the top left of the map; or H). While it is on, its dial replaces the construction dial for every order on an
  existing building: running upgrade, waiting (`#place`), just clicked (sweep and dots), refused (red flash and cross), raze and
  the finish animation, drawn the same way. New builds (no building standing yet) keep the construction dial. Switching the info
  on or off hands each hex over marker by marker, so a hex always shows exactly one dial.
- Markers never take mouse or touch input: hover, taps, wheel and drags go to the map under them like on any tile. A marker
  grows (at least 1.3x; at the smallest zoom to the size where its compact box with text shows) when the mouse is on its dial,
  its box or its hex, or when a touch taps its dial (the tap still reaches the map; a tap on the box reveals nothing, the hex
  under it belongs to the map). The mouse directly on a marker's dial or box wins over the hex under it: only that marker
  grows, and where several overlap the one on top (the hovered one, else the right-most) takes it. The box text stands on its
  own, there are no tooltips on it. While a marker is hovered, the map's tile tooltip does not show.
