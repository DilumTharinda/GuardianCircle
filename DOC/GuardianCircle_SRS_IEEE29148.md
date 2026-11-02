# SOFTWARE REQUIREMENTS SPECIFICATION

**for**

# GuardianCircle

**An Integrated Personal Safety, Location Tracking, and Lost & Found Mobile Platform**

Prepared in accordance with ISO/IEC/IEEE 29148:2018
(Systems and Software Engineering — Life Cycle Processes — Requirements Engineering)

Version 1.0

Prepared by: Project Team GuardianCircle (6 Members)

Course: Mobile Applications Development (INTE 22283)

Date: 04 September 2026

---

## Document Revision History

| Version | Date | Description | Author |
|---|---|---|---|
| 0.1 | 2026-08-21 | Initial concept: PawCare (pet-care) SRS draft (IEEE 830) | Project Team |
| 0.2 | 2026-08-25 | Idea revised per lecture feedback; merged Campus Lost & Found, SafeWalk, SafeRoute concepts | Project Team |
| 0.3 | 2026-08-30 | Generalized scope beyond campus; added Parent-Child and Pet-Owner tracking roles | Project Team |
| 0.4 | 2026-09-02 | Added manual hardware-button emergency trigger and fallback mechanisms | Project Team |
| 1.0 | 2026-09-04 | First complete SRS release under ISO/IEC/IEEE 29148:2018 template | Project Team |

---

## Table of Contents

- Document Revision History — 2
- Table of Contents — 3
- 1. Introduction — 4
  - 1.1 Purpose — 4
  - 1.2 Scope — 4
  - 1.3 Product Overview — 4
    - 1.3.1 Product Perspective — 4
    - 1.3.2 Product Functions — 5
    - 1.3.3 User Characteristics — 5
    - 1.3.4 Limitations — 6
  - 1.4 Definitions, Acronyms, and Abbreviations — 6
- 2. References — 8
- 3. Specific Requirements — 9
  - 3.1 External Interface Requirements — 9
    - 3.1.1 User Interfaces — 9
    - 3.1.2 Hardware Interfaces — 9
    - 3.1.3 Software Interfaces — 9
    - 3.1.4 Communications Interfaces — 9
  - 3.2 Functional Requirements — 11
    - 3.2.1 Personal Safety Module (SOS, Journey Tracking, Safe Routes) — 11
    - 3.2.2 Lost & Found Module — 14
    - 3.2.3 Account, Role, and Community Module — 16
    - 3.2.4 Parent-Child Tracking Module — 17
    - 3.2.5 Pet and Item Tracking Module (IoT, Optional Phase 2) — 19
    - 3.2.6 Administration and Moderation Module — 20
  - 3.3 Usability Requirements — 22
  - 3.4 Performance Requirements — 22
  - 3.5 Logical Database Requirements — 22
  - 3.6 Design Constraints — 22
  - 3.7 Software System Attributes — 23
    - 3.7.1 Reliability — 23
    - 3.7.2 Availability — 23
    - 3.7.3 Security — 23
    - 3.7.4 Maintainability — 23
    - 3.7.5 Portability — 24
  - 3.8 Supporting Information — 24
- 4. Verification — 25
- 5. Appendices — 26
  - 5.1 Appendix A — Team and Role Allocation — 26
  - 5.2 Appendix B — Traceability to Module Intended Learning Outcomes (ILOs) — 26
  - 5.3 Appendix C — Assumptions on Third-Party Free-Tier Limits — 26
  - 5.4 Appendix D — Complete Role Summary — 26

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) describes the functional and non-functional requirements for GuardianCircle, an integrated mobile application combining personal safety alerting, live location tracking (self, dependents, and pets/items), safe-route guidance, and community-based lost-and-found reporting. This document is prepared in accordance with ISO/IEC/IEEE 29148:2018, Systems and Software Engineering - Life Cycle Processes - Requirements Engineering, and is intended for use by the development team, the project supervisor, and evaluators of the Mobile Applications Development (INTE 22283) module as the authoritative reference for system scope, features, and constraints.

### 1.2 Scope

The product to be developed is named GuardianCircle. It is a cross-platform mobile application, built using React Native (Expo), that runs on both Android and iOS from a single codebase. GuardianCircle originated from the convergence of three separate concepts proposed for this module — "Campus Lost & Found", "SafeWalk", and "SafeRoute" — which were merged into a single platform because they share a common technical foundation: real-time location awareness, trusted-relationship networks, and community-driven alerting.

While the pilot deployment and demonstration scenario for this module is a university campus, the system is designed generically so that its safety and recovery services extend beyond a single campus to residential communities, workplaces, commuters, and the general public. The application allows any user to:

- Trigger and receive personal safety (SOS) alerts and share live location with a trusted circle;
- Track the location and safety status of linked dependents (e.g., a parent monitoring a child) and linked trackable entities (e.g., a pet or valuable item fitted with a Bluetooth Low Energy tag);
- Share and follow safe or risk-flagged travel routes based on community reports;
- Report and recover lost items or pets through a location- and photo-based community matching system;
- Interact through a role-based platform that includes general users, parents/guardians, dependents, pet owners, trusted contacts, and administrators/moderators.

The system aims to:

- Reduce emergency response time through fast, low-friction SOS mechanisms, including hardware-button and gesture-based triggers;
- Increase the recovery rate of lost items and pets through real-time, location-aware community matching;
- Give parents/guardians and pet owners reliable, real-time visibility into the safety and whereabouts of those in their care;
- Reduce exposure to unsafe locations through crowd-sourced risk reporting and safer-route suggestions;
- Provide a secure, role-based, and privacy-respecting platform for all user types.

An optional Phase 2 extension involving BLE-based hardware tags (built on an ESP32 microcontroller) for pet collars and item/child trackers is included in this document for completeness but is explicitly marked as out of scope for the mandatory deliverable and will only be attempted if development time permits.

### 1.3 Product Overview

#### 1.3.1 Product Perspective

GuardianCircle is a new, self-contained mobile application; it is not a modification of an existing system. It follows a client-server architecture in which the React Native (Expo) mobile client communicates with backend cloud services for authentication, data storage, real-time synchronization, and push notifications. The high-level system context is summarized below.

| Component | Technology | Responsibility |
|---|---|---|
| Mobile Client | React Native + Expo | User interface, offline caching, device sensor/GPS/BLE access |
| Authentication | Firebase Authentication | Email/password and Google sign-in, session/token management |
| Primary Database | Cloud Firestore | Profiles, journeys, alerts, lost & found reports, linked-entity data (real-time sync) |
| Local Storage | Expo SQLite | Offline-first cache of trusted circle, last known location, pending reports |
| Secure Token Storage | Expo SecureStore | Encrypted storage of authentication tokens and sensitive keys |
| Media Storage | Cloudinary (Free Tier) | Item/pet photos, profile pictures, lost-report images |
| Notifications | Firebase Cloud Messaging (FCM) | SOS alerts, geofence alerts, match notifications, reminders |
| Maps & Location | Google Maps / Places API | Route mapping, geofencing, nearby-place search, heatmap overlay |
| Optional IoT Module | ESP32 + BLE (react-native-ble-plx) | Pet collar / child / item tag tracking (Phase 2) |

#### 1.3.2 Product Functions

A summary of the major functions provided by GuardianCircle is given below; each is elaborated with detailed requirements in Section 3.2.

- **Personal Safety (SOS)** – one-tap and hardware-trigger emergency alerts, live journey tracking, and automatic check-ins.
- **Safe Route Guidance** – route sharing, crowd-sourced unsafe-location reporting, and safer-route suggestions.
- **Lost & Found** – report, match, and recover lost items or pets using photo and location data.
- **Parent-Child Tracking** – live location monitoring, geofenced safe-zones, and SOS visibility for a linked dependent.
- **Pet / Item Tracking (IoT)** – BLE tag pairing for pets or valuables, with out-of-range and location alerts.
- **Account Security & Role Management** – authentication and role-based access across all user types.
- **Administration & Moderation** – a dashboard for monitoring active alerts and moderating community reports.

#### 1.3.3 User Characteristics

| User Class | Description | Technical Expertise |
|---|---|---|
| Primary User (General/Student/Adult) | Main end-user; uses SOS, journey tracking, safe routes, and lost & found features for themselves. | Low to moderate |
| Parent / Guardian | Monitors one or more linked child/dependent accounts; receives location and safety alerts. | Low to moderate |
| Child / Dependent | Linked, tracked user with a simplified interface; location sharing cannot be disabled by this role. | Low |
| Pet Owner | Manages pet profile(s) and pairs BLE collars/tags; monitors pet location and activity. | Low to moderate |
| Trusted Contact | Receives SOS, journey, and overdue alerts on behalf of a Primary User during active journeys. | Low |
| Admin / Moderator | Oversees active safety alerts and moderates lost & found and unsafe-location reports. | Moderate to high |
| System Administrator | Development-team role responsible for backend configuration and monitoring (development-time only). | High |

#### 1.3.4 Limitations

- The project must operate entirely within the free-tier limits of all third-party services (Firebase Spark plan, Cloudinary Free plan, Google Maps free quota) as the team has no budget for paid infrastructure.
- Manual emergency triggering via a physical volume-button sequence is feasible as a background/system-wide listener on Android but is restricted to foreground-only operation on iOS, since Apple does not permit third-party interception of hardware buttons system-wide.
- The Phase 2 BLE hardware-tag integration (pets, children, or items) is optional and contingent on remaining development time within the 15-week academic schedule.
- Cloudinary Free Tier is limited to 25 credits per month; client-side image compression is required before upload.
- The system must comply with the assessment milestones defined in the INTE 22283 module lesson plan.

### 1.4 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|---|---|
| API | Application Programming Interface |
| BLE | Bluetooth Low Energy |
| CRUD | Create, Read, Update, Delete |
| ETA | Estimated Time of Arrival |
| FCM | Firebase Cloud Messaging |
| GPS | Global Positioning System |
| ILO | Intended Learning Outcome |
| IoT | Internet of Things |
| JWT | JSON Web Token |
| MVP | Minimum Viable Product |
| NFR | Non-Functional Requirement |
| OWASP | Open Web Application Security Project |
| RBAC | Role-Based Access Control |
| SOS | Emergency distress signal ("Save Our Souls", conventional emergency alert term) |
| SRS | Software Requirements Specification |
| UI/UX | User Interface / User Experience |

---

## 2. References

- ISO/IEC/IEEE 29148:2018, Systems and Software Engineering — Life Cycle Processes — Requirements Engineering.
- IEEE Std 830-1998, IEEE Recommended Practice for Software Requirements Specifications (baseline reference for the earlier PawCare draft).
- Google Firebase Documentation, https://firebase.google.com/docs, accessed 2026.
- Cloudinary Documentation, https://cloudinary.com/documentation, accessed 2026.
- React Native Documentation, https://reactnative.dev/docs, accessed 2026.
- Expo Documentation, https://docs.expo.dev, accessed 2026.
- Google Maps Platform Documentation, https://developers.google.com/maps, accessed 2026.
- react-native-ble-plx Documentation, https://github.com/dotintent/react-native-ble-plx, accessed 2026.
- OWASP Mobile Application Security Verification Standard, https://owasp.org/www-project-mobile-app-security, accessed 2026.
- Apple Human Interface Guidelines — Emergency SOS, https://developer.apple.com, accessed 2026.
- Google Material Design Guidelines, https://material.io, accessed 2026.
- Mobile Applications Development (INTE 22283) — 15-Week Lesson Plan, Course Handout, 2026.

---

## 3. Specific Requirements

### 3.1 External Interface Requirements

#### 3.1.1 User Interfaces

- The mobile application shall provide a clean, icon-driven interface consistent with Material Design (Android) and Human Interface Guidelines (iOS).
- Primary navigation shall be provided via a bottom tab bar (Home, Safety, Map, Lost & Found, Profile).
- A dedicated, always-reachable SOS control shall be present on the Home screen and accessible within two taps from any screen.
- The Child/Dependent role shall present a simplified interface with restricted settings access.
- Screens shall be designed and prototyped in Figma prior to implementation.
- The Admin/Moderator dashboard (FR-6.1–FR-6.6) shall be delivered as a separate responsive web application, accessible via desktop or mobile browser, and shall not be built into or bundled with the React Native mobile client.

#### 3.1.2 Hardware Interfaces

- The application shall access the device GPS module for all location-based features.
- The application shall access the device camera for capturing lost/found item and pet photos.
- The application shall access the device accelerometer for fall/sudden-stop detection and shake-to-SOS gestures.
- The application shall listen for physical volume-button press sequences to trigger the manual emergency alert (Android: background-capable via foreground/accessibility service; iOS: foreground-only, per platform restriction).
- (Optional) The application shall communicate with ESP32-based BLE tags/collars for pet, child-item, or valuables tracking.

#### 3.1.3 Software Interfaces

| Interface | Purpose |
|---|---|
| Firebase Authentication API | User registration, login, and session/token management |
| Cloud Firestore API | Real-time storage and retrieval of profiles, journeys, alerts, and reports |
| Firebase Cloud Messaging API | Delivery of SOS, geofence, match, and reminder push notifications |
| Cloudinary Upload API | Storage and delivery of item, pet, and profile media |
| Google Maps / Places API | Map rendering, geolocation, geofencing, nearby-place search, heatmap overlay |
| Expo SQLite | Local, offline-first storage of trusted circle and cached location/report data |
| Expo SecureStore | Secure on-device storage of authentication tokens |
| react-native-ble-plx | BLE scanning and communication with ESP32 tags/collars (Phase 2) |

#### 3.1.4 Communications Interfaces

- All client-server communication shall use HTTPS/TLS-encrypted requests.
- Real-time data synchronization shall use Firestore's real-time listener protocol over a persistent connection.
- Push notifications shall be delivered via Firebase Cloud Messaging over the platform's native notification channel, with SOS-class alerts using high-priority/critical channels where supported.
- An SMS-based fallback notification path shall be used for SOS alerts when the sender device has no active internet connectivity, where technically supported by the platform.

### 3.2 Functional Requirements

#### 3.2.1 Personal Safety Module (SOS, Journey Tracking, Safe Routes)

**FR-1.1 In-App SOS Alert**

| Description | The system shall allow a user to trigger an emergency SOS alert with a single tap from within the application. |
|---|---|
| Inputs | SOS button tap; current GPS location. |
| Processing | Capture current GPS coordinates; create an alert record in Firestore; notify all trusted circle members and, where applicable, the linked parent/guardian and admin dashboard via FCM. |
| Outputs | SOS alert dispatched; confirmation vibration/sound; live location shared with recipients until cancelled or resolved. |
| Priority | High |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.2 Manual Emergency Trigger — Triple Volume-Button Press**

| Description | The system shall allow a user to trigger an SOS alert by pressing the volume-up (or volume-down) button three times in quick succession, without needing to open the application. |
|---|---|
| Inputs | Physical volume-button press sequence (3 presses within a 1.5-second window). |
| Processing | A background/foreground service (Android) or foreground key-event observer (iOS) detects the press pattern and invokes the same SOS pipeline as FR-1.1; a short cancellable countdown (default 5 seconds) is shown to prevent false triggers. |
| Outputs | SOS alert triggered after countdown expiry (unless cancelled); confirmation vibration/sound. |
| Priority | High |
| Related ILO(s) | ILO2, ILO4, ILO5 |

**FR-1.3 Shake-to-SOS Fallback**

| Description | The system shall allow a user to trigger an SOS alert by shaking the device firmly while the application is in the foreground, as a cross-platform fallback to the hardware-button trigger. |
|---|---|
| Inputs | Accelerometer motion data exceeding a defined shake-intensity threshold. |
| Processing | Monitor accelerometer stream while app is foregrounded; on threshold match, show cancellable countdown, then invoke the SOS pipeline (FR-1.1). |
| Outputs | SOS alert triggered after countdown expiry. |
| Priority | Medium |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.4 Lock-Screen / Home-Screen SOS Widget**

| Description | The system shall provide a device home-screen and/or lock-screen widget that allows the user to trigger an SOS alert without fully unlocking or opening the application. |
|---|---|
| Inputs | Widget tap. |
| Processing | Invoke the SOS pipeline (FR-1.1) directly from the widget context. |
| Outputs | SOS alert dispatched. |
| Priority | Medium |
| Related ILO(s) | ILO2, ILO4 |

**FR-1.5 Fall / Sudden-Stop Detection**

| Description | The system shall detect a sudden fall or abrupt stop in motion using the device accelerometer and prompt the user to confirm safety before automatically triggering an SOS alert. |
|---|---|
| Inputs | Continuous accelerometer stream during an active journey. |
| Processing | Apply a motion-pattern threshold to detect a fall/sudden-stop event; display an on-screen confirmation prompt with countdown; auto-trigger SOS (FR-1.1) if unanswered. |
| Outputs | Safety confirmation prompt, or an SOS alert if unacknowledged. |
| Priority | Medium |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.6 Live Journey Tracking with Auto Check-In**

| Description | The system shall allow a user to start a tracked journey from a starting point to a destination, sharing live location with selected trusted contacts until arrival. |
|---|---|
| Inputs | Start location, destination, expected arrival time, selected trusted contacts. |
| Processing | Stream live GPS location to Firestore at defined intervals; compare current time/location against expected ETA and destination geofence. |
| Outputs | Live location visible to trusted contacts; automatic check-in notification on arrival; overdue alert if the user has not arrived within a grace period past the ETA. |
| Priority | High |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.7 Route Sharing**

| Description | The system shall allow a user to share their planned or in-progress travel route with trusted contacts. |
|---|---|
| Inputs | Selected route, trusted contact list. |
| Processing | Generate a shareable live route view backed by the active journey record (FR-1.6). |
| Outputs | Trusted contacts can view the live route and current position on a map. |
| Priority | Medium |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.8 Unsafe-Location Reporting**

| Description | The system shall allow any user to report a location as unsafe, tagging it with a category (e.g., poor lighting, harassment, animal hazard, accident). |
|---|---|
| Inputs | GPS location, category, optional description/photo. |
| Processing | Store the report in Firestore with a geohash for spatial querying; make the report available for community upvote/confirmation. |
| Outputs | Unsafe-location report published; visible as a map marker to nearby users. |
| Priority | Medium |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.9 Unsafe-Zone Heatmap**

| Description | The system shall aggregate confirmed unsafe-location reports into a visual heatmap layer on the map view. |
|---|---|
| Inputs | Confirmed unsafe-location reports within a map viewport. |
| Processing | Query and cluster reports by geographic density; render as a heatmap overlay. |
| Outputs | Heatmap layer showing relative risk concentration across an area. |
| Priority | Low |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.10 Safer-Route Suggestion**

| Description | The system shall suggest an alternative route that avoids areas with a high density of confirmed unsafe-location reports, where a viable alternative exists. |
|---|---|
| Inputs | Origin, destination, current unsafe-zone data. |
| Processing | Query Google Maps/Places API for candidate routes; score each route against unsafe-zone density; recommend the lowest-risk viable option. |
| Outputs | Suggested route(s) with a relative safety indicator. |
| Priority | Low |
| Related ILO(s) | ILO4, ILO6 |

**FR-1.11 Trusted Circle Management**

| Description | The system shall allow a user to add, remove, and set permission levels for trusted contacts who receive their safety alerts and shared location. |
|---|---|
| Inputs | Contact details or in-app user reference; permission level. |
| Processing | Create/update a trusted-relationship record shared across the Safety, Journey, and Lost & Found modules. |
| Outputs | Updated trusted circle list; recipients are notified of their added role. |
| Priority | High |
| Related ILO(s) | ILO4, ILO5 |

#### 3.2.2 Lost & Found Module

**FR-2.1 Report Lost Item or Pet**

| Description | The system shall allow a user to report a lost item or pet with a photo, description, category, and last-known location. |
|---|---|
| Inputs | Photo (uploaded to Cloudinary), category, description, last-known GPS location. |
| Processing | Store the report in Firestore with status "Lost"; compress image client-side before upload. |
| Outputs | Report published; confirmation to the reporting user. |
| Priority | High |
| Related ILO(s) | ILO4, ILO6 |

**FR-2.2 Report Found Item or Sighting**

| Description | The system shall allow any user to report a found item, or a sighting of a previously reported lost item/pet, including location and optional photo. |
|---|---|
| Inputs | Location, category/description or reference to an existing lost report, optional photo/notes. |
| Processing | Create or append a found/sighting record; notify the original reporter via FCM if matched to an existing report. |
| Outputs | Found/sighting record stored; notification sent to the original reporter. |
| Priority | High |
| Related ILO(s) | ILO4, ILO6 |

**FR-2.3 Automated Match Suggestion**

| Description | The system shall automatically suggest potential matches between lost and found reports based on location proximity, category, and descriptive similarity. |
|---|---|
| Inputs | Active lost and found reports. |
| Processing | Run a proximity and attribute-similarity comparison (location radius, category, keyword/color match) across open reports; rank candidate matches. |
| Outputs | Ranked list of potential matches surfaced to both reporters with an in-app notification. |
| Priority | Medium |
| Related ILO(s) | ILO4, ILO6 |

**FR-2.4 In-App Match Notification and Chat**

| Description | The system shall notify both parties when a potential match is identified and allow them to communicate in-app to arrange recovery. |
|---|---|
| Inputs | Match event, message text. |
| Processing | Create a chat thread linked to the matched reports; deliver messages via Firestore real-time listener; send FCM push on new message. |
| Outputs | Chat thread visible to both parties; push notifications on new activity. |
| Priority | Medium |
| Related ILO(s) | ILO4 |

**FR-2.5 Community Upvote / Confirmation**

| Description | The system shall allow users to upvote or confirm the validity of a lost/found or unsafe-location report to improve data quality and reduce spam. |
|---|---|
| Inputs | Upvote/confirm action on a report. |
| Processing | Increment a confidence score on the report; reports below a trust threshold may be flagged for moderator review. |
| Outputs | Updated confidence score visible on the report; low-confidence reports flagged in the Admin dashboard. |
| Priority | Low |
| Related ILO(s) | ILO4, ILO5 |

**FR-2.6 Report Status Tracking**

| Description | The system shall track and display the status of a lost/found report through its lifecycle (Lost/Missing → Sighted/Matched → Reunited/Returned) in real time. |
|---|---|
| Inputs | Status-change events. |
| Processing | Update the Firestore document; push updates to all clients subscribed via a real-time listener. |
| Outputs | Updated status visible instantly to all users viewing the report. |
| Priority | Medium |
| Related ILO(s) | ILO4 |

**FR-2.7 Karma / Reward Points**

| Description | The system shall award karma points to users who help recover a lost item or pet, or whose reports are confirmed as accurate. |
|---|---|
| Inputs | Confirmed recovery or confirmed report event. |
| Processing | Increment the user's karma score; update a visible profile badge/level. |
| Outputs | Updated karma score and badge displayed on the user's profile. |
| Priority | Low |
| Related ILO(s) | ILO4 |

#### 3.2.3 Account, Role, and Community Module

**FR-3.1 User Registration and Login**

| Description | The system shall allow users to register and log in using email/password or Google sign-in. |
|---|---|
| Inputs | Email, password, or Google account credentials. |
| Processing | Authenticate via Firebase Authentication; issue and securely store a session token (Expo SecureStore). |
| Outputs | User is logged in and redirected to the home screen. |
| Priority | High |
| Related ILO(s) | ILO4, ILO5 |

**FR-3.2 Role-Based Access Control**

| Description | The system shall restrict access to features according to the authenticated user's role (Primary User, Parent/Guardian, Child/Dependent, Pet Owner, Trusted Contact, Admin/Moderator). |
|---|---|
| Inputs | User role stored at registration or assigned via linking. |
| Processing | Enforce role checks on both UI navigation and backend Firestore security rules. |
| Outputs | Only role-appropriate screens and actions are accessible. |
| Priority | High |
| Related ILO(s) | ILO5 |

**FR-3.3 Profile and Notification Preference Management**

| Description | The system shall allow a user to manage personal profile information and configure notification preferences per alert category. |
|---|---|
| Inputs | Profile fields; notification toggle settings. |
| Processing | Update the user's Firestore profile document; apply preferences to FCM topic subscriptions. |
| Outputs | Updated profile; notifications filtered per user preference (SOS-class alerts cannot be disabled). |
| Priority | Low |
| Related ILO(s) | ILO4 |

**FR-3.4 Offline-First Data Access**

| Description | The system shall allow continued access to critical cached data (trusted circle, last known location, pending reports) without an active internet connection. |
|---|---|
| Inputs | Locally cached data. |
| Processing | Read from Expo SQLite; queue any edits or new reports for synchronization once connectivity is restored. |
| Outputs | Core screens remain usable offline; queued actions sync automatically upon reconnection. |
| Priority | Medium |
| Related ILO(s) | ILO4 |

#### 3.2.4 Parent-Child Tracking Module

**FR-4.1 Parent-Child Account Linking**

| Description | The system shall allow a Parent/Guardian to send a link request to a Child/Dependent account (or create a managed child profile) establishing a persistent tracking relationship. |
|---|---|
| Inputs | Child account identifier or managed-profile details; parent confirmation. |
| Processing | Create a linked-entity record of type "child" associated with the parent account; on the child device, enforce that location sharing to the linked parent cannot be disabled. |
| Outputs | Linked child appears in the parent's dashboard; child device reflects the active parental link. |
| Priority | High |
| Related ILO(s) | ILO4, ILO5 |

**FR-4.2 Live Child Location Monitoring**

| Description | The system shall allow a Parent/Guardian to view the live location of a linked child on a map at any time, independent of an active journey. |
|---|---|
| Inputs | Child's live GPS stream. |
| Processing | Stream child location to Firestore at defined intervals; restrict read access to the linked parent(s) via security rules. |
| Outputs | Live child location displayed on the parent's map view. |
| Priority | High |
| Related ILO(s) | ILO4, ILO6 |

**FR-4.3 Safe-Zone (Geofence) Alerts**

| Description | The system shall allow a Parent/Guardian to define one or more safe-zones (e.g., home, school) and receive an alert when the linked child enters or exits a zone. |
|---|---|
| Inputs | Safe-zone boundary (center point and radius); child's live location. |
| Processing | Continuously evaluate the child's location against defined geofence boundaries; trigger an FCM notification on a boundary-crossing event. |
| Outputs | Push notification to the parent on zone entry/exit. |
| Priority | Medium |
| Related ILO(s) | ILO4, ILO6 |

**FR-4.4 Child SOS Trigger and Visibility**

| Description | The system shall allow a Child/Dependent to trigger an SOS alert (via FR-1.1, FR-1.2, or FR-1.3) that is always routed to the linked Parent/Guardian in addition to any trusted contacts. |
|---|---|
| Inputs | SOS trigger event from the child's device. |
| Processing | Extend the standard SOS pipeline to guarantee delivery to all linked parent accounts, regardless of the child's individual notification settings. |
| Outputs | SOS alert delivered to linked parent(s) with the child's live location. |
| Priority | High |
| Related ILO(s) | ILO4, ILO5 |

**FR-4.5 Journey and Location History View**

| Description | The system shall allow a Parent/Guardian to view a recent history of a linked child's journeys and check-ins. |
|---|---|
| Inputs | Historical journey and check-in records for the linked child. |
| Processing | Query Firestore for the child's journey history within a configurable retention window. |
| Outputs | Timeline/list view of past journeys, check-ins, and safe-zone events. |
| Priority | Low |
| Related ILO(s) | ILO4 |

#### 3.2.5 Pet and Item Tracking Module (IoT, Optional Phase 2)

**FR-5.1 BLE Tag / Collar Pairing**

| Description | If implemented, the system shall allow a Pet Owner (or Primary User, for a valuable item) to pair a BLE-enabled ESP32 tag or collar with the mobile application and link it to a pet or item profile. |
|---|---|
| Inputs | BLE device signal; user confirmation; pet/item profile reference. |
| Processing | Scan for BLE devices using react-native-ble-plx; establish and persist the pairing; associate the tag with a linked-entity record of type "pet" or "item". |
| Outputs | Tag successfully paired and linked to a profile. |
| Priority | Low (Optional) |
| Related ILO(s) | ILO2, ILO6 |

**FR-5.2 Pet / Item Location and Activity Tracking**

| Description | If implemented, the system shall display the last-known location of a paired pet or item, and, for pet collars, activity level, step count, and rest time. |
|---|---|
| Inputs | Sensor/location data stream from the ESP32 tag over BLE. |
| Processing | Parse incoming BLE data packets; store readings in Firestore; render on a dashboard for the linked owner. |
| Outputs | Dashboard showing last-known location and, where applicable, activity metrics. |
| Priority | Low (Optional) |
| Related ILO(s) | ILO4, ILO6 |

**FR-5.3 Out-of-Range Alert**

| Description | If implemented, the system shall notify the owner when a paired BLE tag moves beyond a defined proximity range of the owner's device. |
|---|---|
| Inputs | BLE signal strength (RSSI) between the owner's device and the tag. |
| Processing | Monitor RSSI against a configurable threshold; trigger an FCM notification when the threshold is exceeded for a sustained period. |
| Outputs | Push notification alerting the owner that the pet/item is out of range, with last-known location. |
| Priority | Low (Optional) |
| Related ILO(s) | ILO4, ILO6 |

**FR-5.4 Auto-Prompt to Report Lost Pet**

| Description | If implemented, the system shall prompt the owner to file a Lost & Found report (FR-2.1) automatically pre-filled with the pet's profile and last-known BLE location when an out-of-range alert (FR-5.3) is not resolved within a defined period. |
|---|---|
| Inputs | Unresolved out-of-range alert; pet profile data. |
| Processing | Monitor time elapsed since the out-of-range alert; if unresolved, generate a pre-filled draft lost report for owner confirmation. |
| Outputs | Draft lost-pet report presented to the owner for one-tap submission. |
| Priority | Low (Optional) |
| Related ILO(s) | ILO4, ILO6 |

#### 3.2.6 Administration and Moderation Module

**FR-6.1 Active Alert Dashboard**

| Description | The system shall provide Admin/Moderator users with a real-time dashboard listing all currently active SOS alerts. |
|---|---|
| Inputs | Active SOS alert records. |
| Processing | Subscribe to a Firestore real-time listener filtered to active alerts; sort by recency/severity. |
| Outputs | Live-updating list/map of active SOS alerts with locations. |
| Priority | High |
| Related ILO(s) | ILO4, ILO5 |

**FR-6.2 Report Moderation**

| Description | The system shall allow Admin/Moderator users to review, approve, or remove lost/found and unsafe-location reports, particularly those flagged by low community confidence (FR-2.5). |
|---|---|
| Inputs | Flagged or reported content; moderator action. |
| Processing | Update report status/visibility in Firestore based on moderator decision. |
| Outputs | Report approved, hidden, or removed from public view. |
| Priority | Medium |
| Related ILO(s) | ILO5 |

**FR-6.3 Heatmap and Report Analytics View**

| Description | The system shall provide Admin/Moderator users with an aggregated analytics view of unsafe-location density and lost & found report volume over time. |
|---|---|
| Inputs | Historical report data. |
| Processing | Aggregate and query report records by time window and geography. |
| Outputs | Analytics dashboard with heatmap and trend charts. |
| Priority | Low |
| Related ILO(s) | ILO4 |

**FR-6.4 Restricted Admin Account Creation**

| Description | The system shall not allow an Admin/Moderator account to be created through the standard user registration flow (FR-3.1). The first Admin account in the system shall be provisioned only through a secure, system-level bootstrap process executed outside the mobile application. |
|---|---|
| Inputs | System-level bootstrap script/console command; initial administrator credentials. |
| Processing | Run a one-time, server-side provisioning script (e.g., a Firebase Admin SDK script or Cloud Function executed by the development/operations team) that creates the account and directly sets its role to Admin via a secured backend mechanism (e.g., Firebase custom claims or a protected Firestore field not writable by client requests). |
| Outputs | A single, verified Admin account exists in the system; no client-side registration path can create this role. |
| Priority | High |
| Related ILO(s) | ILO5 |

**FR-6.5 Admin-Initiated Role Promotion**

| Description | The system shall allow an existing Admin to promote a normally registered user account (created via FR-3.1) to the Admin/Moderator role from the web-based admin dashboard. |
|---|---|
| Inputs | Target user account reference; promoting Admin's authenticated session; confirmation action. |
| Processing | Verify the requester holds an active Admin role via backend security rules; update the target user's role field through a protected server-side operation (not a direct client write); log the promotion event with requester ID, target ID, and timestamp. |
| Outputs | Target account's role updated to Admin/Moderator; promotion recorded in an audit log; promoted user gains dashboard access on next login. |
| Priority | High |
| Related ILO(s) | ILO5 |

**FR-6.6 Web-Only Admin Dashboard Access**

| Description | The system shall restrict all Admin/Moderator dashboard functions (FR-6.1 Active Alert Dashboard, FR-6.2 Report Moderation, FR-6.3 Heatmap and Report Analytics View, FR-6.5 Admin-Initiated Role Promotion) to a responsive web application, separate from the mobile client codebase. |
|---|---|
| Inputs | Admin login via the web application; browser session. |
| Processing | Serve the admin dashboard as an independently deployed responsive web front-end that consumes the same Firebase Authentication and Cloud Firestore backend as the mobile app; enforce role-based access at both the web front-end routing layer and the backend security rules. |
| Outputs | Admin functions rendered and usable only through the web dashboard; no admin-only screens, routes, or controls are present in the mobile application build. |
| Priority | High |
| Related ILO(s) | ILO2, ILO5 |

### 3.3 Usability Requirements

- The interface shall follow platform-appropriate design conventions (Material Design for Android, Human Interface Guidelines for iOS) to minimize the learning curve for new users.
- Critical actions — triggering SOS, reporting a lost item, or starting a tracked journey — shall be reachable within two taps from the home screen.
- The Child/Dependent interface shall be simplified, using larger touch targets and reduced settings exposure appropriate for younger or less technical users.
- All emergency-trigger mechanisms (button, shake, widget) shall provide clear, immediate feedback (vibration, sound, and/or visible countdown) so the user is never uncertain whether an alert has been sent.

### 3.4 Performance Requirements

- The application shall load the home screen within 3 seconds under normal network conditions (WiFi or 4G).
- An SOS alert shall be dispatched to all recipients within 2 seconds of trigger detection under normal network conditions.
- Real-time updates (live location, community feed, lost & found status, chat) shall propagate to connected clients within 5 seconds of the originating change.
- The system shall support at least 50 concurrent active users during testing and demonstration without noticeable degradation, consistent with Firebase Spark free-tier quotas.
- Map, nearby-service, and route-safety queries shall return results within 4 seconds under normal network conditions.
- The lost & found automated match suggestion (FR-2.3) shall return candidate matches within 5 seconds of report submission.

### 3.5 Logical Database Requirements

The system's primary data store is Cloud Firestore, organized around the following principal collections/entities:

- **Users** — account profile, role, authentication reference, notification preferences.
- **LinkedEntities** — a generalized relationship record with a type field (child, pet, item, trusted_contact) linking an owning user to a tracked/managed profile; this shared model underlies parent-child tracking, pet/item tracking, and trusted-contact relationships.
- **Journeys** — active and historical journey records including route, ETA, and check-in status.
- **Alerts** — SOS and geofence alert records, including trigger source, location, timestamp, and recipient list.
- **Reports** — lost/found item and pet reports, and unsafe-location reports, each with a geohash field for spatial querying and a confidence score.
- **Matches** — candidate and confirmed matches between lost and found reports, with associated chat threads.
- **BLETags** — paired tag metadata, last-known location, and activity readings (Phase 2).

Core profile data, the trusted circle, and the most recent known location are additionally cached locally in Expo SQLite to support offline-first access.

### 3.6 Design Constraints

- The mobile client must be built using React Native with Expo to allow a single codebase to target both Android and iOS.
- The application must remain within Firebase Spark (free) plan quotas: 50,000 monthly active users for authentication, 1 GiB Firestore storage, and up to 20,000 document writes per day.
- Media storage must remain within Cloudinary's Free Tier (25 credits per month across storage, bandwidth, and transformations); client-side image compression is required before upload.
- No paid third-party service or hosting platform requiring a credit card may be used for the mandatory deliverable.
- The Admin/Moderator dashboard shall be built and deployed as a separate responsive web application (e.g., a React web front-end), independent of the React Native/Expo mobile client build, while sharing the same Firebase backend.
- No Admin/Moderator account creation or promotion path shall be exposed through the mobile application's client-side code; all role-escalation logic shall execute only through protected backend operations.
- On iOS, the manual hardware-button emergency trigger (FR-1.2) is limited to foreground app state due to Apple platform restrictions on system-wide interception of physical buttons; the shake-to-SOS (FR-1.3) and widget (FR-1.4) mechanisms serve as the cross-platform fallback.
- The Phase 2 BLE hardware-tag integration is optional and contingent on remaining development time within the 15-week academic schedule.

### 3.7 Software System Attributes

#### 3.7.1 Reliability

- The system shall degrade gracefully when offline, retaining access to cached trusted-circle and last-known-location data via Expo SQLite.
- Failed synchronization attempts (reports, journey updates) shall be retried automatically once connectivity is restored.
- An SMS-based fallback shall be attempted for SOS alerts when the sending device has no active data connectivity, where technically supported.

#### 3.7.2 Availability

- Core safety functions (SOS trigger, cached last-known location) shall remain available even when the backend is briefly unreachable, queuing the alert for delivery upon reconnection.
- The system shall target availability consistent with the uptime of its underlying Firebase services.

#### 3.7.3 Security

- Passwords shall never be stored in plaintext; authentication is delegated to Firebase Authentication, which applies industry-standard hashing.
- Authentication tokens shall be stored using Expo SecureStore rather than unencrypted local storage.
- Firestore security rules shall enforce role-based access control at the database level, not solely in the client UI, including restricting a child's or pet's/item's location data to only their linked parent/owner and authorized trusted contacts.
- Camera, location, motion/sensor, and notification permissions shall be requested at runtime and only when required by a specific feature, in line with OWASP Mobile Top 10 recommendations.
- A Child/Dependent account shall require explicit Parent/Guardian consent to establish the tracking link (FR-4.1), and the child shall be informed within the app that location sharing to the linked parent is active and cannot be independently disabled.
- Personally identifiable information (e.g., phone numbers, precise home addresses) shall be visible only to authorized parties (e.g., linked trusted contacts, linked parents).
- The Admin/Moderator role shall never be assignable through a client-writable field; role values shall be set only via trusted backend logic (e.g., Firebase custom claims or a Cloud Function), never directly by mobile or web client requests.
- The initial ("first") Admin account shall be created exclusively through an out-of-band, system-level bootstrap process performed by the development/operations team, and shall not be reachable through any in-app registration screen.
- Every Admin role promotion (FR-6.5) shall be authorized by an already-authenticated Admin and recorded in an audit log capturing the requester, the promoted account, and the timestamp.
- The mobile application build shall contain no Admin dashboard UI, routes, or API calls; Admin-only operations shall be reachable only from the separately deployed web application.

#### 3.7.4 Maintainability

- The codebase shall follow a modular component structure (screens, components, services, hooks) to support parallel development across the six-member team.
- Environment-specific configuration (API keys, Firebase config) shall be stored in environment variables, not hard-coded.
- The LinkedEntities data model shall be implemented generically (shared by child, pet, item, and trusted-contact relationships) to minimize duplicated logic across modules.

#### 3.7.5 Portability

- The application shall run on both Android 8.0+ and iOS 13+ from a single React Native/Expo codebase with minimal platform-specific branching.
- Platform-specific limitations (e.g., the iOS hardware-button restriction in Section 3.6) shall be isolated behind a common interface so the rest of the application logic remains platform-agnostic.

### 3.8 Supporting Information

Supporting information for this specification, including team role allocation, traceability to module Intended Learning Outcomes, and third-party free-tier assumptions, is provided in the Appendices (Section 5).

---

## 4. Verification

Each functional requirement in Section 3.2 shall be verified through a combination of the following methods, consistent with the module's assessment milestones:

| Verification Method | Applicable Requirements | Approach |
|---|---|---|
| Unit Testing | FR-1.x, FR-2.3, FR-4.3 | Jest unit tests for trigger logic, geofence evaluation, and match-scoring algorithms. |
| UI / Integration Testing | FR-1.1–FR-1.4, FR-2.1–FR-2.4, FR-3.1–FR-3.2 | Espresso/Detox-style UI tests and manual QA across core user flows. |
| Manual / Device Testing | FR-1.2 (hardware button), FR-1.3 (shake), FR-5.1–FR-5.3 (BLE) | On-device testing across representative Android and iOS hardware, given platform and sensor dependencies. |
| Demonstration | All high-priority FRs | Live demonstration during the module's final project presentation and demo milestone. |

---

## 5. Appendices

### 5.1 Appendix A — Team and Role Allocation

| Team Area | Members | Responsibility |
|---|---|---|
| Frontend — Safety & Journey | 2 | SOS, journey tracking, hardware/shake trigger, safe-route screens |
| Frontend — Lost & Found & Community | 1 | Lost & found reporting, matching UI, chat, karma system |
| Backend & Cloud | 1 | Firebase configuration, Firestore data model (incl. LinkedEntities), Cloud Functions, notifications |
| Maps, Location & QA | 1 | Maps/Places integration, geofencing, testing (Jest, manual QA) |
| UI/UX, IoT & Documentation | 1 | Wireframes/Figma prototypes, BLE/Phase 2 prototyping, requirements and design documentation, presentation |

### 5.2 Appendix B — Traceability to Module Intended Learning Outcomes (ILOs)

| Feature Area | Related ILO(s) |
|---|---|
| Personal Safety / SOS / Hardware & Shake Triggers | ILO2, ILO4, ILO5, ILO6 |
| Journey Tracking, Safe Routes, Geofencing (GPS/Maps) | ILO4, ILO6 |
| Lost & Found, Matching, Community Reporting | ILO4, ILO6 |
| Parent-Child Tracking | ILO4, ILO5, ILO6 |
| Pet / Item Tracking (BLE / IoT, Optional) | ILO2, ILO6 |
| Security & Role-Based Access | ILO5 |
| Cross-Platform Development (React Native) | ILO1, ILO2, ILO4 |
| Testing and Verification | ILO4 |

### 5.3 Appendix C — Assumptions on Third-Party Free-Tier Limits

- Firebase Spark plan: 50,000 monthly active users (auth), 1 GiB Firestore storage, 20,000 writes/day, 50,000 reads/day — sufficient for development and demonstration scale.
- Cloudinary Free plan: 25 credits/month (1 credit = 1 GB storage, 1 GB bandwidth, or 1,000 transformations), no credit card required.
- Google Maps/Places API: usage kept within Google's monthly free usage credit through query caching and result-set limiting.

### 5.4 Appendix D — Complete Role Summary

| Role | Key Permissions |
|---|---|
| Primary User | Full self-service: SOS, journey tracking, safe routes, lost & found reporting, trusted-circle management. |
| Parent / Guardian | View linked child's live location and history, receive SOS/geofence alerts, define safe-zones. |
| Child / Dependent | Restricted settings; location sharing to linked parent cannot be disabled; can send SOS. |
| Pet Owner | Create pet/item profile, pair BLE tag, view location/activity, receive out-of-range alerts. |
| Trusted Contact | Receive SOS/journey/overdue alerts; view shared live location during active journeys only. |
| Admin / Moderator | View active SOS dashboard; moderate reports; view analytics/heatmap; promote a normal user to Admin. Account is never created via standard registration — the first Admin is provisioned by system-level bootstrap, and all subsequent Admins are created only by promotion from an existing Admin. Accessible only via the separate responsive web dashboard, not the mobile app. |
| System Administrator | Backend configuration and monitoring (development-time role only). |
