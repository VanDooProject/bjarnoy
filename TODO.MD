

# UI/UX
- [ ] render islands completely, show water between only as surface/plane not full tiles; this solves to overlapped rendering issue because the coast tiles are the last rendered tiles around the islands
- [ ] Fog of war
- [ ] zoom 2x with higher res pictures

# Backend
- [ ] implement 2 game modi
  - [ ] hour based one / classic browser game mode; resources trickle in per hour
  - [ ] round based mode; when all players are finished (or max round time is over) resources are distributed; buildings take x turns to finish not minutes/hours
- [ ] somehow make games stateless so pods can be scaled/killed
- [ ] KI player so pros can farm them, noobs could play against them on mobile