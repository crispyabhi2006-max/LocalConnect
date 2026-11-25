/**
 * Firestore Security Rules Test Specification (Dirty Dozen Adversarial Suite)
 * Run against Firebase Emulator Suite when available:
 *   firebase emulators:exec "npx tsx firestore.rules.test.ts"
 */
export const dirtyDozenCases = [
  { id: 1, name: 'Self-role escalation on /users/{uid} update', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Admin role injection on /users/{uid} create', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Cross-user PII read on /users/{otherUid}', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Customer account creating a /businesses doc', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Owner B updating Owner A business doc', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Shadow field (isVerified: true) injection on /businesses', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Orphan service creation referencing nonexistent businessId', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Appointment status shortcutting (creating with Confirmed)', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Appointment creation without atomic bookedSlots lock', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Mutating terminal appointment state (Cancelled -> Confirmed)', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Listing /appointments without customerId/ownerId filter', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Oversized ID (>128 chars) or oversized description (>2000 chars)', expected: 'PERMISSION_DENIED' },
];
