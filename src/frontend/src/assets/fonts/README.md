# Self-hosted fonts

These `.woff2` files are self-hosted rather than linked live from
`fonts.googleapis.com`/`fonts.gstatic.com`. A live Google Fonts `<link>`
makes every visitor's browser fetch the font directly from Google, sending
their IP address before they've consented to anything — a German court
found this to be a GDPR violation (LG München I, 20.01.2022, 3 O 17493/20).
Self-hosting removes that third-party request entirely with no visual
change.

All three families (Outfit, Barlow, Alegreya Sans SC) are licensed under
the [SIL Open Font License 1.1](https://openfontlicense.org/) — see
`google/fonts`'s `ofl/outfit/`, `ofl/barlow/`, `ofl/alegreyasanssc/`
(https://github.com/google/fonts/tree/main/ofl) — which permits
redistribution, including bundled in a repo like this one.

Only the `latin` and `latin-ext` Unicode-range subsets are kept (see the
`@font-face` blocks in `../../style.css`) — `latin-ext` alone covers the
Norse/Nordic diacritics this UI itself uses (e.g. "Fjørdhold"); the
cyrillic/greek/vietnamese subsets Google Fonts also serves aren't needed
here and were dropped to keep the bundle small.

## Adding a weight or family

1. Fetch the CSS for the *exact* weight(s) you need, one weight at a time
   (requesting multiple weights in one query can make Google collapse them
   onto a shared variable-font file instead of distinct static ones):
   ```
   curl -A "Mozilla/5.0 ... Chrome/120 Safari/537.36" \
     "https://fonts.googleapis.com/css2?family=<Family>:wght@<weight>&display=swap"
   ```
   (a real browser UA is required — Google serves an old, less-capable
   format to unrecognised clients).
2. From the response, keep only the `/* latin */` and `/* latin-ext */`
   blocks and download the `.woff2` URL each references.
3. Save as `<family>-<weight>-<subset>.woff2` in this directory and add a
   matching `@font-face` block (with its `unicode-range`) to `style.css`.
