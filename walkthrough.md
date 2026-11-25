# Security Summary

**Reviewed Files**: 23
**Issues Resolved**: 5 (plus 2 environment/console configuration items marked `Needs Follow-Up`)

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unsafe Image URL Schemes | `src/lib/db.ts` | 42 | User- or owner-supplied URLs for avatars, logos, covers, and gallery images were trimmed without validating the URL protocol (`javascript:`, `data:`, `vbscript:`). | Medium | Fixed | Added `sanitizeImageUrl()` allowing only `https://`, `http://`, or bundled `/src/assets/` paths across profile, business, and favourite writes. |
| Slot Lock Ownership Integrity | `firestore.rules` | 355 | Creating a `bookedSlots/{slotKey}` lock verified `customerId` and `getAfter` appointment linkage, without checking that `incoming().ownerId` matched the parent business document's `ownerId`. | Medium | Fixed | Enforced `get(/databases/$(database)/documents/businesses/$(businessId)).data.ownerId == incoming().ownerId` in `firestore.rules` and deployed via `DeployRules`. |
| Missing HTTP Security Headers & API 404 Fallback | `server.ts` | 80, 361 | Express exposed `X-Powered-By`, lacked hardening headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), and allowed unknown `/api/*` paths to fall through to SPA HTML. | Low | Fixed | Disabled `x-powered-by`, added standard response security headers (preserving iframe preview compatibility), and added JSON `404` catch-all middleware for `/api/*`. |
| Unbounded Time/Policy/Notification Inputs | `server.ts` | 266, 308, 345 | `/api/appointments/validate` accepted out-of-range hour/minute strings or negative/excessive `cancellationPolicyHours`, and `/api/notifications/dispatch` did not validate `type` against an allowlist. | Low | Fixed | Added strict `0..23`/`0..59` hour/minute checks, clamped `cancellationPolicyHours` to `0..168`, and enforced `VALID_NOTIFICATION_TYPES` allowlist and string length limits. |
| Unsanitized Contact URI Characters | `src/pages/BusinessDetailsPage.tsx` | 442, 883 | Contact `tel:` and `mailto:` anchor links interpolated stored phone/email strings directly without character filtering. | Low | Fixed | Filtered `tel:` values to `[0-9+\-().\s]` and `mailto:` values to `[a-zA-Z0-9._%+\-@]` before rendering `href`. |
| Firebase Storage Bucket & Rules Activation | `storage.rules` | 1 | Storage rules did not exist in the repository and the Firebase Storage bucket returned `404 Not Found` during live upload probing. | Medium | Needs Follow-Up | Authored owner-scoped `storage.rules` (5 MB max, `image/jpeg`, `image/png`, `image/webp`) and `firebase.json`; requires enabling Firebase Storage in Firebase Console and deploying rules before launch. |
| Maps API Key Restrictions & Billing | `server.ts` | 178 | Server Geocoding requests returned `REQUEST_DENIED` because GCP billing is not enabled on `micro-primer-w3bk6`, and browser/server Maps keys require API & referrer restrictions before public traffic. | Medium | Needs Follow-Up | Confirmed private server logic never leaks secrets to clients; enable GCP billing and apply HTTP referrer / API restrictions in Google Cloud Console before publishing. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Firebase Authentication & Role Boundaries | `firestore.rules` | Enforces `request.auth.uid` ownership checks on `/users/{userId}`, immutable `role` updates, owner-only business/service writes, and customer/owner isolation on `/appointments/{appointmentId}`. |
| Double-Booking Atomicity | `src/lib/db.ts`, `firestore.rules` | Uses atomic Firestore `runTransaction` paired with `businesses/{businessId}/bookedSlots/{slotKey}` `getAfter` cross-validation to prevent concurrent slot collisions. |
| Server Route Auth Verification | `server.ts` | Protects `/api/auth/verify`, `/api/appointments/validate`, and `/api/notifications/dispatch` with `requireFirebaseAuth` (`verifyIdToken` on Bearer tokens). |
| Secrets & Environment Separation | `server.ts`, `firebase-applet-config.json` | No private secrets are embedded in `src/` or `server.ts`; `/firebase-messaging-sw.js` serves only public Firebase Web SDK identifiers. |
| Safe React Rendering | `src/pages/`, `src/components/` | React JSX auto-escaping is used throughout with zero `dangerouslySetInnerHTML` sinks across `src/`. |

## PoC Verification

### 1. Unsafe Image URL Scheme Injection
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URL Scheme Handling |
| Impact | Medium |
| Affected File | `src/lib/db.ts:42` |
| Test Scenario | Submitting `javascript:alert(1)` or `data:text/html,<script>alert(1)</script>` into `logoUrl` / `coverUrl` / `avatarUrl`. |

#### How It Was Fixed
Added `sanitizeImageUrl()` in `src/lib/db.ts` and applied it across all user avatar, business logo/cover/gallery, and favourite image writes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload `javascript:alert(1)` is passed into business or profile update helpers in `src/lib/db.ts`. | Input enters `sanitizeImageUrl()` |
| 2 | `src/lib/db.ts:45-50` checks `/src/assets/` prefix and parses protocol via `new URL(trimmed)`, requiring `https:` or `http:`. | Protocol `javascript:` is rejected |
| 3 | `src/lib/db.ts:54` returns empty string `''`, preventing unsafe URI persistence or rendering. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Unsafe URL schemes are stripped before persistence and cannot be rendered into image sources.

### 2. Slot Lock `ownerId` Spoofing on `bookedSlots`
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Cross-Document Ownership Validation |
| Impact | Medium |
| Affected File | `firestore.rules:355` |
| Test Scenario | Signed-in customer attempts to write a `bookedSlots/{slotKey}` document with a forged `ownerId` differing from the target business's `ownerId`. |

#### How It Was Fixed
Added a Firestore rule check comparing `get(/databases/$(database)/documents/businesses/$(businessId)).data.ownerId` against `incoming().ownerId` during `bookedSlots` creation and deployed the updated rules.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Authenticated customer sends a create request to `/businesses/{businessId}/bookedSlots/{slotKey}` with `ownerId: 'spoofed_uid'`. | Request reaches `bookedSlots` `allow create` rule |
| 2 | `firestore.rules:355` evaluates `get(/databases/$(database)/documents/businesses/$(businessId)).data.ownerId == incoming().ownerId`. | Mismatch evaluates to `false` |
| 3 | Firestore rejects the write with `PERMISSION_DENIED` (confirmed against live database). | **Handled Safely** |

#### Conclusion
**Fix Verified** - Customers cannot forge an arbitrary `ownerId` on slot lock documents, preserving owner cancellation/management integrity.

### 3. Invalid Notification Type & Unbounded Time Inputs on Backend API
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unvalidated API Input Parameters |
| Impact | Low |
| Affected File | `server.ts:266, 308, 345` |
| Test Scenario | Authenticated `POST /api/notifications/dispatch` with `type: "arbitrary_type"` and `POST /api/appointments/validate` with `timeSlot: "29:99"`. |

#### How It Was Fixed
Added allowlist validation (`VALID_NOTIFICATION_TYPES`), explicit hour/minute bounds (`0..23`, `0..59`), and `0..168` clamping for `cancellationPolicyHours`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Authenticated `POST /api/notifications/dispatch` arrives with `{ type: "arbitrary_type", ... }`. | Passes `requireFirebaseAuth` into route handler |
| 2 | `server.ts:346` checks `!VALID_NOTIFICATION_TYPES.has(type)` (and `server.ts:272-275` checks `hh`/`mm` bounds on validation requests). | Validation check fails |
| 3 | Route immediately returns HTTP `400 Bad Request` JSON (`Invalid notification dispatch payload.`). | **Handled Safely** |

#### Conclusion
**Fix Verified** - Only allowlisted notification categories and bounded calendar times are accepted by backend API routes.
