# Landing intro

A short story sequence on the landing page. It covers the time from page open until all map tiles are loaded,
then hands over to the real map.

## Landing page

Before the saga a landing page shows over the intro's own first scene, the skald's hall at rest (beat 1 with the
fire lit, nothing moving). The saga starts only on a click.

- Title "BJARNØY" (not translated) and the tagline "A saga of the north, played together."
- Three feature cards: "Multiplayer" (every other realm on the island is a real player, ally with them or raid them),
  "No pay to win" (premium supports the game and only adds quality-of-life features) and "Ad-free" (an indie game,
  made with love, no ads).
- "Hear the saga" starts the saga with the sound on (the click is the user gesture browsers need). The link "or play it
  muted" under it starts it with the sound off.
- The map button reads "Go to the map · loading 62 %" while the map loads, with a thin progress bar along its bottom
  edge (no fill inside). Pressed while loading it arms: "Opens when loaded · 62 %", and it closes the intro as soon as
  loading completes; pressed again it disarms. Once the map is loaded it reads "Go to the map" with a "ready" bubble,
  the bar is gone, and pressing it closes the intro at once, like Esc. The load is one value: the loaded pages over the
  total pages of the terrain, buildings and animations groups that have reported, 0 until one has, 1 once the tiles are
  loaded.
- The top-right "Log in" / "Enter world" button stays. The narration line and the playback controls stay hidden until
  the saga starts.
- On phones the cards stack and the buttons are full width, centred.
- When the saga starts the page fades out (600 ms) while the camera moves into the scene (see Technique).
- The landing page waits for the player in every case, with or without reduced motion and whether or not the tiles are
  loaded. The replay and "Play intro" have no landing page.

## Story

1. **Skald's fire** (intro): a skald by a hearth begins the saga.
2. **Prophecy** (intro): a prophecy says the homeland is lost.
3. **The sending** (intro): the jarl stakes his whole line on his only son, a child, shown as a silhouette. You are
   sworn to guide him and build his realm. The boy boards, the longship leaves, and the camera turns with it out to
   sea while the homeland and the last light fall behind.
4. **Ravens** (intro): the camera turn goes on: an island comes into view, the ravens return, a moon rises on the
   right and grows behind the ship, and the seabed comes up as a sleeping giant. Bjarnøy is not empty: the giants
   sleep under the sea. Only hinted. Night lifts toward dawn; the camera pushes in on the ship and the scene turns
   into the fog.
5. **Longship in fog** (hold, loops): the ship rows through fog. Other settlements show faintly in the background
   (smoke, lights, sails). The ravens fly past now and then.
6. **Landfall** (exit): "Land!" The intro's fog fades while the map's own fog lifts, and the landfall onboarding
   takes over.

## Timing

- The landing page shows only on a device that has neither founded a settlement nor stored a login. `#intro` shows it
  anyway; `#loop` loops the saga without it; "Play intro" plays the saga at once.
- The saga starts on the click on the landing page, then plays once, then the hold, then the exit.
- Each intro beat lasts as long as its voice clip in the player's language plus 0.8 s; the sending ends with its
  voice, and the ravens take over in a 1.8 s crossfade while its camera turn and ship are still moving. The scenes are timed
  to fit both languages' lengths; motion follows the spoken lines where it can, without slowing into slow motion.
- The hold plays at least as long as its voice clip (plus 0.8 s). After that it ends as soon as the tiles are
  loaded. Skip ends it at once.
- Landfall lasts 6 s; the lookout's call plays as it starts.
- Once the tiles are loaded and the sequence is still playing, a skip button shows. Pressing it starts the exit
  (fog lifts) right away.
- A play/pause button sits at the left end of the timeline. Paused, the scene and its timing stop; tiles that finish loading wait for play to continue. Clicking the scene pauses or resumes it, like the pause button.
- Without mouse movement, a tap or a key press for 2.5 s, the buttons fade to 35 % and come back with the next input.
  While paused they stay at full strength.
- The skip button shows at full strength for 3 s when it appears, then fades like the others.
- Esc closes the intro at once, without the landfall: the landing page shows the map, the replay and the loop go back to the docs.

## Voice

- Every beat has a spoken clip in English and German. Beats 1–5 are the skald's voice; the call "Land!" is a
  second voice, the lookout.
- The clips of the player's language load before the map tiles, in beat order, also while the sound is off.
- Each clip starts with its beat, also while the sound is off, so turning the sound on joins the clip at the
  point the beat has reached.
- The speaker at the right end of the timeline turns the sound on and off. Hovering or focusing it opens a volume range above it. The loop starts with the sound off
  (browsers only allow sound after a click); the button blinks while the sound is off. With reduced motion it
  shows the off state without blinking. "Hear the saga" on the landing page starts the saga with the sound on, "or play it muted" with the sound off.
- The replay starts with the sound on.
- Pause pauses the clip, skip stops it.

## Login

- On the landing page (and its loop) a button sits at the top right. Without a login it reads "Log in": it closes
  the intro and opens the login page. With a stored login it reads "Enter world": it closes the intro at once, like
  Esc. It fades like the other buttons.

## Timeline

- While the intro plays, a timeline runs along the bottom, with play/pause at its left and the time and the speaker at its right. Each beat is a chapter. The chapter lengths follow the voice clips in the player's language, and the hold counts with its shortest length.
- Clicking or dragging on the timeline jumps to that point. The scene, the narration and the voice clip follow. The arrow keys jump 5 s, Page Up/Down jump to the previous or next chapter, and Home/End jump to the start or end.
- Hovering, focusing, dragging or pausing makes the timeline thicker and names the chapters. On a timeline narrower than 360 px, only the current chapter is named.
- While paused, a play symbol shows in the centre of the screen. It grows on hover.
- On the landing page, landfall is locked until the map tiles are loaded. It shows a moving hatch and fills as voices, terrain and buildings load. Until then you can't seek past the end of the hold. If the playhead gets there first, it waits with a spinner while the hold keeps playing. Once the tiles are loaded, jumping into landfall works like skip. Once landfall runs, the timeline is locked.
- While the timeline is expanded and assets are still loading, four lines above landfall show the pages loaded for voices, terrain, buildings and building animations. Animations don't hold back landfall; they keep loading in the map.
- In the replay and the loop the whole timeline is open, with no load display.

## Reduced motion

- With reduced motion on, the landing page shows exactly as without. Once the saga is started (and in the replay, which
  shows a play button instead), it runs exactly as without reduced motion.
- The landing page no longer goes straight to the map when the tiles finish loading before the player has pressed
  anything: it waits for the player in every case.

## Replay

- The player docs page "The saga" tells the story and links to a replay of the intro.
- The replay plays every beat, with no load gating: the hold runs for its minimum, and the skip button shows
  from the start.
- The replay ends on a white screen with "Back to docs" and "Enter the game".

## Looping

Opening the landing page or the replay with `#loop` plays the intro without end: every beat, no load gating, starting again after landfall. `#loop(1-2,5)` loops only the listed beats, numbered as in the story list.

## Play again

On desktop the landing page always shows a "Play intro" button at the bottom right, styled like skip, for every visitor. It plays the intro again over the landing page. Phones don't show it for now.

## Technique

- The skald's hall (`beats/HallScene.vue`) is shared by the fire and the prophecy beats and is drawn in layers inside
  one camera group: far (the hall, wider than the view so a turning camera never shows an edge), the fire's light, the
  hearth, the staff, the skald (bench, body, arm), the smoke and fire, and near (the listeners' backs). The staff has its
  own layer, behind the bench.
- Frame 0 of the fire beat is the lit hall at rest. The transition into the saga runs in absolute times from the beat's
  start as CSS animations (so the timeline's seeking moves them like all others):
  - Camera, 0 to 2.6 s, `cubic-bezier(.45, 0, .2, 1)`: from no transform to the end state, held through the rest of
    the fire beat and as the prophecy beat's static start state. Landscape: camera `translateX(150px) scale(1.26)`,
    far `translateX(170px)`, near `translateX(-420px) scale(1.14)`, skald `translateX(-200px) scale(1.05)`, staff
    `translateX(-165px) scale(1.04)`. Portrait (aspect ratio at most 1:1): 70px/1.26, 60px, -150px/1.1, -60px/1.03,
    -50px/1.02.
  - Fire (scale from the hearth): 1 to 0.12 by 0.3 s, held to 1.4 s, to 0.6 by 1.7 s, held to 2.4 s, to 1 by 3.4 s,
    easing out, never above 1.
  - Fire light (hall glow, floor light, rim lights on the skald and the staff): 1 to 0.18 by 0.3 s, to 0.5 by 0.7 s
    (held to 1.4 s), to 0.85 by 1.7 s (held to 2.4 s), to 1 by 3.4 s. The rim lights keep a quarter of their strength
    at the lowest (0.25 + 0.75 of the light).
  - Darkening (a full-scene dark layer): 0 to 0.45 by 0.3 s, held to 0.7 s, to 0.1 by 1 s, to 0 by 3.4 s.
  - The prophecy beat's own fire flare, light and arm animations are unchanged; it starts from the end state above.
- All code, no loaded assets except the voice clips (`src/frontend/src/intro/audio/{en,de}/<n>-<beat>.mp3`):
  scenes are inline SVG in the components, animated with CSS (transform and opacity only, so it stays smooth
  while the map loads).
- Fog and smoke: a small tileable noise texture generated once at runtime from a fixed seed (canvas 2D), then only
  moved and faded.
- Works in landscape and portrait: each scene fills the screen and crops at the edges; story-critical elements stay
  in a central safe frame that fits both 16:9 and 9:16. Narration and buttons respect the safe areas. Rotating
  mid-play keeps the animation running.
