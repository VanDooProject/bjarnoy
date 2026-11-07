# Landing intro

A short story sequence on the landing page. It covers the time from page open until all map tiles are loaded,
then hands over to the real map.

## Story

1. **Skald's fire** (intro): a skald by a hearth begins the saga.
2. **Prophecy** (intro): a prophecy says the homeland is lost.
3. **The sending** (intro): the jarl stakes his whole line on his only son, a child, shown as a silhouette. You are
   sworn to guide him and build his realm.
4. **Ravens** (intro): the ravens return. Bjarnøy is not empty: the giants sleep under the sea. Only hinted.
5. **Longship in fog** (hold, loops): the ship rows through fog. Other settlements show faintly in the background
   (smoke, lights, sails). The ravens fly past now and then.
6. **Landfall** (exit): "Land!" The intro's fog fades while the map's own fog lifts, and the landfall onboarding
   takes over.

## Timing

- On the landing page the intro plays on its own only on a device that has neither founded a settlement nor stored a
  login. `#intro`, `#loop` and "Play intro" play it anyway.
- The intro plays once, then the hold, then the exit.
- Each intro beat lasts as long as its voice clip in the player's language plus 0.8 s. The scenes are timed
  to fit both languages' lengths; motion follows the spoken lines where it can, without slowing into slow motion.
- The hold plays at least as long as its voice clip (plus 0.8 s). After that it ends as soon as the tiles are
  loaded. Skip ends it at once.
- Landfall lasts 6 s; the lookout's call plays as it starts.
- Once the tiles are loaded and the sequence is still playing, a skip button shows. Pressing it starts the exit
  (fog lifts) right away.
- A pause button shows while the intro plays. Paused, the scene and its timing stop; tiles that finish loading wait for play to continue.
- Between skip and pause, a restart button (⟲) starts the intro again at its first beat. Clicking the scene pauses or resumes it, like the pause button.
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
- A sound button sits right of the pause button. On the landing page the intro starts with the sound off
  (browsers only allow sound after a click); the button blinks while the sound is off. With reduced motion it
  shows the off state without blinking.
- The replay starts with the sound on.
- Pause pauses the clip, skip stops it.

## Login

- On the landing page (and its loop) a button sits at the top right. Without a login it reads "Log in": it closes
  the intro and opens the login page. With a stored login it reads "Enter world": it closes the intro at once, like
  Esc. It fades like the other buttons.

## Reduced motion

- With reduced motion on, the intro shows its first frame and a play button. Pressed, it runs exactly as without
  reduced motion.
- If the tiles finish loading before play is pressed, the page goes straight to the map.

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

- All code, no loaded assets except the voice clips (`src/frontend/src/intro/audio/{en,de}/<n>-<beat>.mp3`):
  scenes are inline SVG in the components, animated with CSS (transform and opacity only, so it stays smooth
  while the map loads).
- Fog and smoke: a small tileable noise texture generated once at runtime from a fixed seed (canvas 2D), then only
  moved and faded.
- Works in landscape and portrait: each scene fills the screen and crops at the edges; story-critical elements stay
  in a central safe frame that fits both 16:9 and 9:16. Narration and buttons respect the safe areas. Rotating
  mid-play keeps the animation running.
