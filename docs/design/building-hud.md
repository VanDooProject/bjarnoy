# Building HUD (settlement view)

- Every own building shows a hex dial with its level. The ring shows the upgrade state: green = can upgrade, red = cannot
  (short of resources, Longhouse cap, missing prerequisite, storage cap), yellow arc = upgrade running (time left inside),
  gold number with a full gold ring = max level.
- Only a maxed Longhouse shows the crown.
- The time until a short-of-resources upgrade becomes affordable is a premium feature. Free accounts see only that
  resources are short.
- Next to the dial a box shows the details. Near zoom: up to three rows (upgrade state, production or Town Square feast,
  garrison troop types, training queue). Mid zoom: two rows. Far zoom: the dial only.
- The Longhouse drops its production row while troops are garrisoned there.
- Up to three missing prerequisites are listed; from four on, two are listed plus "+n more".
- Overlapping markers stack left to right: the right-most is on top. Hovering or tapping a marker brings it to the front,
  enlarged.
- The building info can be switched off (map button or H). While it is on, it replaces the construction dial for upgrades
  of existing buildings.
