# Safer route scoring

Phase 7 requests real driving alternatives from the public OSRM demo endpoint
using OpenStreetMap data. It asks for full GeoJSON route geometry and maps each
OSRM distance, duration, and coordinate array into the existing route scorer's
candidate format. OSRM may return no alternatives for some origin/destination
pairs; only routes returned by the service are displayed.

For each real Phase 6 aggregated unsafe-report cell, the scorer finds its nearest
distance to the route geometry. A cell within 250 metres contributes its
aggregate weight multiplied by `1 - distance / 250`; cells farther away
contribute zero. Contributions are summed and rounded to three decimals. Lower
scores are ranked first, with distance and then duration as deterministic
tie-breakers. Invalid candidates and malformed report cells are ignored. With
no report data, routes have no report-based score or suggested route.

The score compares only against available user reports. It is not a probability,
a promise of safety, or evidence that unreported areas are safe. The public OSRM
endpoint is demo infrastructure with no availability guarantee; this integration
uses its driving profile and is not a pedestrian-routing guarantee or a
production safety backend.

The route panel credits `Routing by OSRM` and `© OpenStreetMap contributors` and
links to the OpenStreetMap copyright/ODbL page.
