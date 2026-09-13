# browsergame frontend

this is a MVP for a browsergame frontend written with angular.

`map/public/images/tiles` used to be a submodule of the private
`VanDooProject/bg_assets_hextile` assets repository. It was dropped from
`.gitmodules` because the deployed app no longer builds from here, and every
deployment of the current app was cloning those ~220 MB twice — the live
frontend vendors the same repository at `src/frontend/vendor/bg_assets_hextile`.
Clone it into `map/public/images/tiles` by hand if you need to run this again.

## Getting started


