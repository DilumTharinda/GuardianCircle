# Safer route scoring

Phase 7 includes a reusable scorer for real route candidates, but route retrieval
is not available in the current app configuration. `app.config.js` supplies
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` to the Android native map plugin for map tiles;
it does not enable or call Google Directions API or Routes API. The current
scorer therefore receives no production routes and the map explains the missing
integration instead of drawing synthetic alternatives.

When a configured routing integration supplies candidates, the scorer uses the
real Phase 6 aggregated unsafe-report cells. For each cell it finds the nearest
distance to the route geometry. A cell within 250 metres contributes its
aggregate weight multiplied by `1 - distance / 250`; cells farther away
contribute zero. Contributions are summed and rounded to three decimals. Lower
scores are ranked first, with distance and then duration as deterministic
tie-breakers. Invalid candidates and malformed report cells are ignored.

This score only compares routes against available user reports. It is not a
probability, a promise of safety, or evidence that unreported areas are safe.
With no report data, the result explicitly has no report-based score or suggested
route.
