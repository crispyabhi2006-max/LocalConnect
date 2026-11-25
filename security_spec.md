# LocalConnect Security Specification

## 1. Data Invariants
1. **Strict Two-Role Isolation**: A `/users/{userId}` document may only have `role` equal to `'customer'` or `'owner'`. Once created, `role`, `uid`, and `createdAt` are immutable.
2. **PII Isolation**: User documents in `/users/{userId}` are readable and writable solely by the matching authenticated user (`request.auth.uid == userId`).
3. **Business Ownership**: Only an authenticated user with `role == 'owner'` in `/users/{uid}` may create a `/businesses/{businessId}` document, and `ownerId` must equal `request.auth.uid` and remain immutable.
4. **Service Ownership**: A `/services/{serviceId}` document cannot exist without an existing parent `/businesses/{businessId}` whose `ownerId == request.auth.uid`.
5. **Atomic Double-Booking Prevention**: Every `/appointments/{appointmentId}` creation requires an atomic sibling `/businesses/{businessId}/bookedSlots/{slotKey}` write (`existsAfter`), and `status` must start as `'Pending'`.
6. **Terminal Appointment State Locking**: Once an appointment reaches `'Rejected'`, `'Cancelled'`, or `'Completed'`, no further mutations are permitted.
7. **Appointment Privacy**: Appointments are readable only by `customerId` or `ownerId`.
8. **Notification & Favourite Ownership**: Notifications and favourites are strictly scoped to their recipient/owner (`userId == request.auth.uid`).

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Self-Role Escalation on Update**: Customer sends `updateDoc(users/uid, { role: 'owner' })` -> DENIED.
2. **Third Role Injection on Create**: User sends `setDoc(users/uid, { role: 'admin', ... })` -> DENIED.
3. **Cross-User PII Read**: Authenticated user A reads `/users/userB` -> DENIED.
4. **Customer Creates Business**: Account with `role: 'customer'` attempts `setDoc(businesses/b1, ...)` -> DENIED.
5. **Cross-Owner Business Hijack**: Owner B attempts `updateDoc(businesses/bA, { description: 'hijacked' })` -> DENIED.
6. **Shadow Field Injection on Business**: Owner A sends `{ ...validFields, isVerified: true }` -> DENIED.
7. **Orphan Service Creation**: Owner A creates service with nonexistent `businessId` or Owner B's `businessId` -> DENIED.
8. **Appointment Status Shortcutting**: Customer creates appointment with `status: 'Confirmed'` -> DENIED.
9. **Double Booking Race / Missing Slot Lock**: Customer creates appointment without matching `bookedSlots/{slotKey}` in transaction -> DENIED.
10. **Terminal State Re-opening**: Owner attempts to change `'Cancelled'` appointment back to `'Confirmed'` -> DENIED.
11. **Appointment Cross-Customer Scraping**: Customer B lists `/appointments` without `customerId == uid` -> DENIED.
12. **Resource Poisoning (Oversized ID / String)**: Attacker creates doc with 2KB ID or 50KB description -> DENIED.
