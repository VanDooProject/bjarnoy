# Copy guidelines

Rules for the words in the game's UI (en and de).

## Check every description for player value

Before a sentence goes into the UI or the player docs, ask: what does the player do differently after reading it? A
sentence that only describes how the game or the code works, or that states something the player sees anyway, is noise
for them. It can be useful for the dev docs and for the implementation, but not for the player. Cut it, or move it to the
dev docs (`docs/design/`) or into a `DocsAdminNote`.

Example (player docs, what an army sees), both sentences cut:

- "You see other realms' buildings on any ground you have uncovered, even while their Longhouse is still in the mist."
  The "even while ..." clause describes an implementation detail (which hex the server checks).
- "A realm's name appears over the nearest building you can see." Where the label is anchored is an implementation
  detail; the player just reads the name.

## German terms: Reich and Gebiet

- „Reich" is the realm as a polity: one of your settlements, or a linked group of them, that you run (switch between, name, send troops from). „Deine Reiche", „Reich wechseln".
- „Gebiet" is the land a realm claims: its area and hexes. „Dein Gebiet erweitern", „außerhalb deines Gebiets".
- Use either, by what the sentence means; the English "realm" covers both.

## Rejected copy

Lines that were rejected as cringe. Don't reuse them or write in their style.

- "Your grain starts counting right away. No account, nothing to install."
- „Baustein" (de) as the name of the stone/brick resource: sounds like a toy building block.
- „Das ist das ganze Tutorial. Wähle ein Feld, platziere das Gebäude, und die Kornzählung beginnt. Niemand fragt nach deinem Namen, bevor du etwas hast, das einen Namen verdient." (de, landing): a cute aside instead of an instruction.
- „Kein Konto" · „Nichts zu installieren" · „Mit einem Klick wieder weg" (de, landing chips): the "no account, nothing to install" sales pitch.
- „Das Getreide wird gezählt." (de, landing): the grain-counting line again.
- „Drei Gebäude, kein Jarl." (de, onboarding): a punchline instead of saying what to do.
- „Benenne deins über das Zeichen hier oben, und diese Insel folgt dir auf jedes Gerät." and the button „Jarl benennen" (de, onboarding): marketing tone, and it hides that this creates an account.
- „Dein Reich läuft" / „Dein Reich wartet" (de, onboarding eyebrows): slogans.
- „Ein Indie-Spiel, mit Liebe gemacht. Ohne Werbung." (de, intro landing): "made with love".
- „Gebaut zum Spielen, nicht nur zum Ansehen" (de, showcase): an English slogan carried over word for word.
- „Jedes Feature unten läuft auf derselben Engine, die du oben siehst — keine Attrappen." (de, showcase): bragging.
- „Eine echte End-to-End-Testsuite steuert einen echten Browser …" (de, showcase): bragging with "echt".
- „Logg dich morgen wieder ein, und die Welt hat sich ohne dich weitergedreht." (de, showcase): a cliché.
- „Die Portfolio-Hälfte dieser Seite — wie das Ganze tatsächlich gebaut ist." (de, showcase): "tatsächlich" filler.
- „Es gibt in diesem Spiel noch keinen Upgrade-Weg — hier wird nirgends tatsächlich Premium verkauft — also gibt es nichts weiter zu klicken. Frag denjenigen, der diese Welt betreibt …" (de, simulator): a self-aware "honest" tone.
- „Fast — eines der leuchtenden Grundstücke gehört dir." (de, landing): patronising "Fast —".
- „Landung wird gemacht…" (de, landing): a literal calque of "making landfall".
- „Das Herz der Siedlung." (de, docs, longhouse): a cliché.
