# Landing intro

A short story sequence on the landing page. It covers the time from page open until all map tiles are loaded,
then hands over to the real map.

## Story

1. **Skald's fire** (intro): a skald by a hearth begins the saga.
2. **Prophecy** (intro): a prophecy says the homeland is lost.
3. **Ravens** (intro, optional): the ravens return. Bjarnøy is not empty: the giants sleep under the sea. Only hinted.
4. **The sending** (intro): the jarl stakes his whole line on his only son, a child, shown as a silhouette. You are
   sworn to guide him and build his realm.
5. **Longship in fog** (hold, loops): the ship rows through fog. Other settlements show faintly in the background
   (smoke, lights, sails). The ravens fly past now and then.
6. **Landfall** (exit): "Land!" The intro's fog fades while the map's own fog lifts, and the landfall onboarding
   takes over.

## Timing

- The intro plays once, then the hold, then the exit.
- The hold plays at least as long as its narration takes to read (1 s plus the words at 230 words per minute). After
  that it ends as soon as the tiles are loaded. Skip ends it at once.
- Optional beats (3) are dropped when the tiles are already loaded before the beat starts.
- Once the tiles are loaded and the sequence is still playing, a skip button shows. Pressing it starts the exit
  (fog lifts) right away.
- A pause button shows while the intro plays. Paused, the scene and its timing stop; tiles that finish loading wait for play to continue.
- Narration text (en + de) is written once the beat timings are settled.

## Reduced motion

- With reduced motion on, the intro shows its first frame and a play button. Pressed, it runs exactly as without
  reduced motion.
- If the tiles finish loading before play is pressed, the page goes straight to the map.

## Replay

- The player docs page "The saga" tells the story and links to a replay of the intro.
- The replay plays every beat (3 included), with no load gating: the hold runs for its minimum, and the skip button shows
  from the start.
- The replay ends on a white screen with "Back to docs" and "Enter the game".

## Looping

Opening the landing page or the replay with `#loop` plays the intro without end: every beat, no load gating, starting again after landfall. `#loop(1-2,5)` loops only the listed beats, numbered as in the story list.

## Technique

- All code, no loaded assets: scenes are inline SVG in the components, animated with CSS (transform and opacity
  only, so it stays smooth while the map loads).
- Fog and smoke: a small tileable noise texture generated once at runtime from a fixed seed (canvas 2D), then only
  moved and faded.
- Works in landscape and portrait: each scene fills the screen and crops at the edges; story-critical elements stay
  in a central safe frame that fits both 16:9 and 9:16. Narration and buttons respect the safe areas. Rotating
  mid-play keeps the animation running.
