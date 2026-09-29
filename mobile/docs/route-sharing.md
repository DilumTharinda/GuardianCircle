# Route sharing — FR-1.7

Route sharing is available only while a Firebase-authenticated journey is
active. It reuses the Phase 2 Trusted Circle listener and React Native's built-in
system share sheet; there is no SMS, WhatsApp, notification, or live-sharing
backend in this phase.

The user selects one or more active Trusted Circle entries as intended
recipients, then must choose the matching person or conversation in the system
share sheet. The checklist does not pre-address, send to, or verify delivery to
those contacts. Pending contacts are excluded. The `receiveJourney` permission
is not used because this is an explicit one-time OS share rather than automatic
GuardianCircle delivery.

The one-time message includes active/foreground tracking status, destination,
elapsed time, straight-line distance, destination map link, and the latest
recorded location map link with capture time. It excludes owner and journey IDs,
contact names/numbers/UIDs, start location, travelled polyline, location history,
GPS accuracy, Firestore paths, and API keys. Nothing about a share is persisted.

iOS reports when the share sheet is dismissed. React Native reports
`sharedAction` on Android even when delivery cannot be confirmed, so the UI says
only that the update was handed to sharing options and never claims it was sent
or delivered. Native failures are shown as generic retryable errors.

Manual verification should cover an active journey with one and multiple active
contacts, pending-only/empty circles, contact listener failure, iOS dismissal,
Android chooser behavior, native share failure, journey completion while the
dialog is open, sign-out/account change, and inspection of the shared text for
the privacy exclusions above.
