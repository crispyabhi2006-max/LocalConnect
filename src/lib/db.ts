import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  Appointment,
  AppointmentStatus,
  AppNotification,
  BookedSlot,
  Business,
  Favourite,
  NotificationType,
  Review,
  ServiceItem,
  UserProfile,
} from '../types';

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`.slice(0, 120);
}

function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

export function sanitizeImageUrl(val: string | undefined | null, maxLen = 1000): string {
  const trimmed = clampStr(val, maxLen);
  if (!trimmed) return '';
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    // Reject malformed or dangerous schemes (javascript:, data:, vbscript:, etc.)
  }
  return '';
}

function sortByCreatedDesc<T extends { createdAt?: { toMillis?: () => number } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export function formatReadableFirestoreError(err: unknown, fallback = 'Operation failed.'): string {
  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) {
      if (parsed.error.includes('Missing or insufficient permissions')) {
        return 'Permission denied by Firestore security rules. Ensure you are signed in with the proper account role.';
      }
      return parsed.error;
    }
  } catch {
    // Plain string message
  }
  return raw || fallback;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createUserProfile(
  profile: Omit<UserProfile, 'createdAt' | 'updatedAt'>
): Promise<void> {
  const path = `users/${profile.uid}`;
  try {
    await setDoc(doc(db, 'users', profile.uid), {
      uid: profile.uid,
      role: profile.role,
      name: clampStr(profile.name, 120) || 'LocalConnect User',
      email: clampStr(profile.email, 200),
      phone: clampStr(profile.phone, 40),
      city: clampStr(profile.city, 100),
      avatarUrl: sanitizeImageUrl(profile.avatarUrl, 1000),
      emailNotifications: Boolean(profile.emailNotifications),
      pushNotifications: Boolean(profile.pushNotifications),
      fcmToken: clampStr(profile.fcmToken, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      'name' | 'phone' | 'city' | 'avatarUrl' | 'emailNotifications' | 'pushNotifications' | 'fcmToken'
    >
  >
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) payload.name = clampStr(updates.name, 120) || 'LocalConnect User';
    if (updates.phone !== undefined) payload.phone = clampStr(updates.phone, 40);
    if (updates.city !== undefined) payload.city = clampStr(updates.city, 100);
    if (updates.avatarUrl !== undefined) payload.avatarUrl = sanitizeImageUrl(updates.avatarUrl, 1000);
    if (updates.emailNotifications !== undefined) {
      payload.emailNotifications = Boolean(updates.emailNotifications);
    }
    if (updates.pushNotifications !== undefined) {
      payload.pushNotifications = Boolean(updates.pushNotifications);
    }
    if (updates.fcmToken !== undefined) payload.fcmToken = clampStr(updates.fcmToken, 500);
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchActiveBusinesses(): Promise<Business[]> {
  const path = 'businesses';
  try {
    const q = query(collection(db, 'businesses'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return sortByCreatedDesc(snap.docs.map((d) => d.data() as Business));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeActiveBusinesses(
  callback: (items: Business[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'businesses'), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as Business)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'businesses');
    }
  );
}

export async function fetchBusinessById(businessId: string): Promise<Business | null> {
  const path = `businesses/${businessId}`;
  try {
    const snap = await getDoc(doc(db, 'businesses', businessId));
    return snap.exists() ? (snap.data() as Business) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeBusinessById(
  businessId: string,
  callback: (business: Business | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = `businesses/${businessId}`;
  return onSnapshot(
    doc(db, 'businesses', businessId),
    (snap) => {
      callback(snap.exists() ? (snap.data() as Business) : null);
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function fetchOwnerBusiness(ownerId: string): Promise<Business | null> {
  const path = 'businesses';
  try {
    const q = query(collection(db, 'businesses'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as Business;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeOwnerBusiness(
  ownerId: string,
  callback: (business: Business | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'businesses'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.empty ? null : (snap.docs[0].data() as Business));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'businesses');
    }
  );
}

export async function checkDuplicateBusiness(name: string, city: string): Promise<boolean> {
  const path = 'businesses';
  try {
    const normalized = name.trim().toLowerCase();
    const cityLower = city.trim().toLowerCase();
    const q = query(collection(db, 'businesses'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.some((d) => {
      const b = d.data() as Business;
      return (
        b.nameLower.trim().toLowerCase() === normalized &&
        b.city.trim().toLowerCase() === cityLower
      );
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createBusiness(
  input: Omit<
    Business,
    'id' | 'nameLower' | 'ratingAvg' | 'reviewCount' | 'viewCount' | 'createdAt' | 'updatedAt'
  >
): Promise<string> {
  const businessId = makeId('biz');
  const path = `businesses/${businessId}`;
  try {
    const payload = {
      id: businessId,
      ownerId: input.ownerId,
      ownerName: clampStr(input.ownerName, 120) || 'Business Owner',
      name: clampStr(input.name, 120),
      nameLower: clampStr(input.name, 120).toLowerCase(),
      category: input.category,
      description: clampStr(input.description, 2000),
      address: clampStr(input.address, 250),
      city: clampStr(input.city, 100),
      postalCode: clampStr(input.postalCode, 20),
      lat: Number(input.lat),
      lng: Number(input.lng),
      placeId: clampStr(input.placeId, 200),
      businessPhone: clampStr(input.businessPhone, 30),
      publicEmail: clampStr(input.publicEmail, 200),
      logoUrl: sanitizeImageUrl(input.logoUrl, 1000),
      coverUrl: sanitizeImageUrl(input.coverUrl, 1000),
      galleryUrls: (input.galleryUrls || [])
        .slice(0, 10)
        .map((u) => sanitizeImageUrl(u, 1000))
        .filter(Boolean),
      openingHours: input.openingHours,
      slotDurationMinutes: Math.max(15, Math.min(240, Number(input.slotDurationMinutes) || 30)),
      cancellationPolicyHours: Math.max(
        0,
        Math.min(168, Number(input.cancellationPolicyHours) || 24)
      ),
      priceRange: input.priceRange,
      ratingAvg: 0,
      reviewCount: 0,
      viewCount: 0,
      isFeatured: Boolean(input.isFeatured),
      isActive: Boolean(input.isActive),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'businesses', businessId), payload);
    return businessId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateBusinessDetails(
  businessId: string,
  updates: Partial<
    Omit<Business, 'id' | 'ownerId' | 'ratingAvg' | 'reviewCount' | 'viewCount' | 'createdAt' | 'updatedAt'>
  >
): Promise<void> {
  const path = `businesses/${businessId}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.ownerName !== undefined) payload.ownerName = clampStr(updates.ownerName, 120);
    if (updates.name !== undefined) {
      payload.name = clampStr(updates.name, 120);
      payload.nameLower = clampStr(updates.name, 120).toLowerCase();
    }
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.description !== undefined) payload.description = clampStr(updates.description, 2000);
    if (updates.address !== undefined) payload.address = clampStr(updates.address, 250);
    if (updates.city !== undefined) payload.city = clampStr(updates.city, 100);
    if (updates.postalCode !== undefined) payload.postalCode = clampStr(updates.postalCode, 20);
    if (updates.lat !== undefined) payload.lat = Number(updates.lat);
    if (updates.lng !== undefined) payload.lng = Number(updates.lng);
    if (updates.placeId !== undefined) payload.placeId = clampStr(updates.placeId, 200);
    if (updates.businessPhone !== undefined) {
      payload.businessPhone = clampStr(updates.businessPhone, 30);
    }
    if (updates.publicEmail !== undefined) payload.publicEmail = clampStr(updates.publicEmail, 200);
    if (updates.logoUrl !== undefined) payload.logoUrl = sanitizeImageUrl(updates.logoUrl, 1000);
    if (updates.coverUrl !== undefined) payload.coverUrl = sanitizeImageUrl(updates.coverUrl, 1000);
    if (updates.galleryUrls !== undefined) {
      payload.galleryUrls = updates.galleryUrls
        .slice(0, 10)
        .map((u) => sanitizeImageUrl(u, 1000))
        .filter(Boolean);
    }
    if (updates.openingHours !== undefined) payload.openingHours = updates.openingHours;
    if (updates.slotDurationMinutes !== undefined) {
      payload.slotDurationMinutes = Math.max(15, Math.min(240, Number(updates.slotDurationMinutes)));
    }
    if (updates.cancellationPolicyHours !== undefined) {
      payload.cancellationPolicyHours = Math.max(
        0,
        Math.min(168, Number(updates.cancellationPolicyHours))
      );
    }
    if (updates.priceRange !== undefined) payload.priceRange = updates.priceRange;
    if (updates.isFeatured !== undefined) payload.isFeatured = Boolean(updates.isFeatured);
    if (updates.isActive !== undefined) payload.isActive = Boolean(updates.isActive);

    await updateDoc(doc(db, 'businesses', businessId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function incrementBusinessView(businessId: string): Promise<void> {
  if (!auth.currentUser) return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'businesses', businessId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const currentViews = Number((snap.data() as Business).viewCount || 0);
      tx.update(ref, { viewCount: currentViews + 1 });
    });
  } catch {
    // Non-critical view counter should not break business page rendering
  }
}

// Services CRUD & Real-time Subscriptions
export async function fetchServicesByBusiness(
  businessId: string,
  includeInactive = false,
  ownerId?: string
): Promise<ServiceItem[]> {
  const path = 'services';
  try {
    const q =
      includeInactive && ownerId
        ? query(collection(db, 'services'), where('ownerId', '==', ownerId))
        : query(collection(db, 'services'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return sortByCreatedDesc(
      snap.docs
        .map((d) => d.data() as ServiceItem)
        .filter((s) => s.businessId === businessId)
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeActiveServices(
  callback: (items: ServiceItem[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'services'), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as ServiceItem)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'services');
    }
  );
}

export function subscribeBusinessServicesPublic(
  businessId: string,
  callback: (items: ServiceItem[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'services'), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const matching = snap.docs
        .map((d) => d.data() as ServiceItem)
        .filter((s) => s.businessId === businessId);
      callback(sortByCreatedDesc(matching));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'services');
    }
  );
}

export function subscribeOwnerServices(
  ownerId: string,
  businessId: string,
  callback: (items: ServiceItem[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'services'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const matching = snap.docs
        .map((d) => d.data() as ServiceItem)
        .filter((s) => s.businessId === businessId);
      callback(sortByCreatedDesc(matching));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'services');
    }
  );
}

export async function createService(
  input: Omit<ServiceItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const serviceId = makeId('svc');
  const path = `services/${serviceId}`;
  try {
    await setDoc(doc(db, 'services', serviceId), {
      id: serviceId,
      businessId: input.businessId,
      ownerId: input.ownerId,
      name: clampStr(input.name, 120),
      description: clampStr(input.description, 600),
      price: Math.max(0, Math.min(1000000, Number(input.price) || 0)),
      durationMinutes: Math.max(5, Math.min(480, Number(input.durationMinutes) || 30)),
      category: clampStr(input.category, 80),
      isActive: Boolean(input.isActive),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return serviceId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateService(
  serviceId: string,
  updates: Partial<
    Pick<ServiceItem, 'name' | 'description' | 'price' | 'durationMinutes' | 'category' | 'isActive'>
  >
): Promise<void> {
  const path = `services/${serviceId}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) payload.name = clampStr(updates.name, 120);
    if (updates.description !== undefined) payload.description = clampStr(updates.description, 600);
    if (updates.price !== undefined) {
      payload.price = Math.max(0, Math.min(1000000, Number(updates.price)));
    }
    if (updates.durationMinutes !== undefined) {
      payload.durationMinutes = Math.max(5, Math.min(480, Number(updates.durationMinutes)));
    }
    if (updates.category !== undefined) payload.category = clampStr(updates.category, 80);
    if (updates.isActive !== undefined) payload.isActive = Boolean(updates.isActive);
    await updateDoc(doc(db, 'services', serviceId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteService(serviceId: string): Promise<void> {
  const path = `services/${serviceId}`;
  try {
    await deleteDoc(doc(db, 'services', serviceId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Notifications
export async function sendNotification(input: {
  userId: string;
  senderId: string;
  title: string;
  message: string;
  type: NotificationType;
  relatedId: string;
}): Promise<void> {
  const notifId = makeId('ntf');
  const path = `notifications/${notifId}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: input.userId,
      senderId: input.senderId,
      title: clampStr(input.title, 150),
      message: clampStr(input.message, 500),
      type: input.type,
      relatedId: clampStr(input.relatedId, 128),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeUserNotifications(
  userId: string,
  callback: (items: AppNotification[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as AppNotification)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    }
  );
}

// Booked Slots & Atomic Appointment Creation
export async function fetchBookedSlotsForDate(businessId: string, date: string): Promise<string[]> {
  const path = `businesses/${businessId}/bookedSlots`;
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'bookedSlots'),
      where('businessId', '==', businessId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as BookedSlot)
      .filter((s) => s.date === date)
      .map((s) => s.timeSlot);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeBookedSlotsForDate(
  businessId: string,
  date: string,
  callback: (slots: string[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = `businesses/${businessId}/bookedSlots`;
  const q = query(
    collection(db, 'businesses', businessId, 'bookedSlots'),
    where('businessId', '==', businessId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const taken = snap.docs
        .map((d) => d.data() as BookedSlot)
        .filter((s) => s.date === date)
        .map((s) => s.timeSlot);
      callback(taken);
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function bookAppointmentAtomic(input: {
  business: Business;
  service: ServiceItem;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  date: string;
  timeSlot: string;
  notes: string;
}): Promise<string> {
  const appointmentId = makeId('apt');
  const slotKey = `${input.date.replace(/-/g, '')}_${input.timeSlot.replace(':', '')}`;
  const apptRef = doc(db, 'appointments', appointmentId);
  const slotRef = doc(db, 'businesses', input.business.id, 'bookedSlots', slotKey);

  try {
    await runTransaction(db, async (tx) => {
      const existingSlot = await tx.get(slotRef);
      if (existingSlot.exists()) {
        throw new Error('This time slot has already been booked. Please select another time.');
      }

      tx.set(apptRef, {
        id: appointmentId,
        businessId: input.business.id,
        businessName: clampStr(input.business.name, 120),
        ownerId: input.business.ownerId,
        customerId: input.customerId,
        customerName: clampStr(input.customerName, 120),
        customerEmail: clampStr(input.customerEmail, 200),
        customerPhone: clampStr(input.customerPhone, 30),
        serviceId: input.service.id,
        serviceName: clampStr(input.service.name, 120),
        servicePrice: Number(input.service.price),
        durationMinutes: Number(input.service.durationMinutes),
        date: input.date,
        timeSlot: input.timeSlot,
        slotKey,
        notes: clampStr(input.notes, 500),
        status: 'Pending' satisfies AppointmentStatus,
        cancellationReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(slotRef, {
        slotKey,
        businessId: input.business.id,
        ownerId: input.business.ownerId,
        customerId: input.customerId,
        appointmentId,
        date: input.date,
        timeSlot: input.timeSlot,
        createdAt: serverTimestamp(),
      });
    });

    await sendNotification({
      userId: input.business.ownerId,
      senderId: input.customerId,
      title: `New appointment request — ${input.service.name}`,
      message: `${input.customerName} requested ${input.service.name} on ${input.date} at ${input.timeSlot}.`,
      type: 'appointment_new',
      relatedId: appointmentId,
    });

    return appointmentId;
  } catch (err) {
    if (err instanceof Error && err.message.includes('already been booked')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, `appointments/${appointmentId}`);
  }
}

export async function updateAppointmentStatus(input: {
  appointment: Appointment;
  newStatus: AppointmentStatus;
  actorUid: string;
  reason?: string;
}): Promise<void> {
  const { appointment, newStatus, actorUid, reason = '' } = input;
  const apptRef = doc(db, 'appointments', appointment.id);
  const slotRef = doc(db, 'businesses', appointment.businessId, 'bookedSlots', appointment.slotKey);

  try {
    await runTransaction(db, async (tx) => {
      const apptSnap = await tx.get(apptRef);
      if (!apptSnap.exists()) {
        throw new Error('Appointment not found.');
      }
      const slotSnap = await tx.get(slotRef);

      tx.update(apptRef, {
        status: newStatus,
        cancellationReason: clampStr(reason, 300),
        updatedAt: serverTimestamp(),
      });

      if ((newStatus === 'Cancelled' || newStatus === 'Rejected') && slotSnap.exists()) {
        tx.delete(slotRef);
      }
    });

    const isOwnerActor = actorUid === appointment.ownerId;
    const recipientId = isOwnerActor ? appointment.customerId : appointment.ownerId;
    const typeMap: Record<AppointmentStatus, NotificationType> = {
      Pending: 'appointment_new',
      Confirmed: 'appointment_confirmed',
      Rejected: 'appointment_rejected',
      Cancelled: 'appointment_cancelled',
      Completed: 'appointment_completed',
    };

    const titleMap: Record<AppointmentStatus, string> = {
      Pending: 'Appointment pending',
      Confirmed: `Appointment confirmed at ${appointment.businessName}`,
      Rejected: `Appointment declined by ${appointment.businessName}`,
      Cancelled: `Appointment cancelled (${appointment.businessName})`,
      Completed: `Appointment completed at ${appointment.businessName}`,
    };

    await sendNotification({
      userId: recipientId,
      senderId: actorUid,
      title: titleMap[newStatus],
      message: `${appointment.serviceName} on ${appointment.date} at ${appointment.timeSlot} is now ${newStatus}.${
        reason ? ` Note: ${reason}` : ''
      }`,
      type: typeMap[newStatus],
      relatedId: appointment.id,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `appointments/${appointment.id}`);
  }
}

export function subscribeCustomerAppointments(
  customerId: string,
  callback: (items: Appointment[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'appointments'), where('customerId', '==', customerId));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as Appointment)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    }
  );
}

export function subscribeOwnerAppointments(
  ownerId: string,
  callback: (items: Appointment[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'appointments'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as Appointment)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    }
  );
}

// Reviews
export async function fetchReviewsByBusiness(businessId: string): Promise<Review[]> {
  const path = 'reviews';
  try {
    const q = query(collection(db, 'reviews'), where('businessId', '==', businessId));
    const snap = await getDocs(q);
    return sortByCreatedDesc(snap.docs.map((d) => d.data() as Review));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchReviewsByCustomer(customerId: string): Promise<Review[]> {
  const path = 'reviews';
  try {
    const q = query(collection(db, 'reviews'), where('customerId', '==', customerId));
    const snap = await getDocs(q);
    return sortByCreatedDesc(snap.docs.map((d) => d.data() as Review));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeBusinessReviews(
  businessId: string,
  callback: (items: Review[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'reviews'), where('businessId', '==', businessId));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as Review)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'reviews');
    }
  );
}

export function subscribeCustomerReviews(
  customerId: string,
  callback: (items: Review[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'reviews'), where('customerId', '==', customerId));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as Review)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'reviews');
    }
  );
}

export async function submitReview(input: {
  business: Business;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const reviewId = makeId('rev');
  const path = `reviews/${reviewId}`;
  try {
    const clampedRating = Math.max(1, Math.min(5, Math.round(input.rating)));
    await setDoc(doc(db, 'reviews', reviewId), {
      id: reviewId,
      businessId: input.business.id,
      businessName: clampStr(input.business.name, 120),
      ownerId: input.business.ownerId,
      customerId: input.customerId,
      customerName: clampStr(input.customerName, 120),
      rating: clampedRating,
      comment: clampStr(input.comment, 1000),
      ownerReply: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const existingReviews = await fetchReviewsByBusiness(input.business.id);
    const count = existingReviews.length;
    const avg =
      count > 0
        ? Number((existingReviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(2))
        : clampedRating;

    await updateDoc(doc(db, 'businesses', input.business.id), {
      ratingAvg: avg,
      reviewCount: count,
      updatedAt: serverTimestamp(),
    });

    await sendNotification({
      userId: input.business.ownerId,
      senderId: input.customerId,
      title: `New ${clampedRating}-star review on ${input.business.name}`,
      message: `${input.customerName} wrote: "${clampStr(input.comment, 120)}"`,
      type: 'review_new',
      relatedId: input.business.id,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function replyToReview(reviewId: string, reply: string): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await updateDoc(doc(db, 'reviews', reviewId), {
      ownerReply: clampStr(reply, 600),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteReview(reviewId: string, businessId: string): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
    const remaining = await fetchReviewsByBusiness(businessId);
    const count = remaining.length;
    const avg =
      count > 0 ? Number((remaining.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(2)) : 0;
    await updateDoc(doc(db, 'businesses', businessId), {
      ratingAvg: avg,
      reviewCount: count,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Favourites
export function subscribeCustomerFavourites(
  userId: string,
  callback: (items: Favourite[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'favourites'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      callback(sortByCreatedDesc(snap.docs.map((d) => d.data() as Favourite)));
    },
    (err) => {
      onError?.(err);
      handleFirestoreError(err, OperationType.LIST, 'favourites');
    }
  );
}

export async function toggleFavouriteBusiness(
  userId: string,
  business: Business,
  isCurrentlyFav: boolean
): Promise<boolean> {
  const favId = `${userId}_${business.id}`;
  const path = `favourites/${favId}`;
  try {
    if (isCurrentlyFav) {
      await deleteDoc(doc(db, 'favourites', favId));
      return false;
    }
    await setDoc(doc(db, 'favourites', favId), {
      id: favId,
      userId,
      businessId: business.id,
      businessName: clampStr(business.name, 120),
      businessCategory: clampStr(business.category, 80),
      businessCity: clampStr(business.city, 100),
      businessCoverUrl: sanitizeImageUrl(business.coverUrl, 1000),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
