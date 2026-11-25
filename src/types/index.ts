import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'customer' | 'owner';

export const BUSINESS_CATEGORIES = [
  'Restaurants',
  'Hospitals and Clinics',
  'Beauty Salons',
  'Shopping Stores',
  'Educational Institutions',
  'Automobile Services',
  'Home Services',
  'Fitness Centres',
  'Other Local Businesses',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export type PriceRange = '$' | '$$' | '$$$' | '$$$$';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type OpeningHours = Record<DayKey, DayHours>;

export const DEFAULT_OPENING_HOURS: OpeningHours = {
  mon: { open: '09:00', close: '18:00', closed: false },
  tue: { open: '09:00', close: '18:00', closed: false },
  wed: { open: '09:00', close: '18:00', closed: false },
  thu: { open: '09:00', close: '18:00', closed: false },
  fri: { open: '09:00', close: '18:00', closed: false },
  sat: { open: '10:00', close: '16:00', closed: false },
  sun: { open: '10:00', close: '14:00', closed: true },
};

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export interface UserProfile {
  uid: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  city: string;
  avatarUrl: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  fcmToken: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Business {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  nameLower: string;
  category: BusinessCategory;
  description: string;
  address: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  placeId: string;
  businessPhone: string;
  publicEmail: string;
  logoUrl: string;
  coverUrl: string;
  galleryUrls: string[];
  openingHours: OpeningHours;
  slotDurationMinutes: number;
  cancellationPolicyHours: number;
  priceRange: PriceRange;
  ratingAvg: number;
  reviewCount: number;
  viewCount: number;
  isFeatured: boolean;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ServiceItem {
  id: string;
  businessId: string;
  ownerId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  category: string;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type AppointmentStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Completed';

export interface Appointment {
  id: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  durationMinutes: number;
  date: string;
  timeSlot: string;
  slotKey: string;
  notes: string;
  status: AppointmentStatus;
  cancellationReason: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BookedSlot {
  slotKey: string;
  businessId: string;
  ownerId: string;
  customerId: string;
  appointmentId: string;
  date: string;
  timeSlot: string;
  createdAt?: Timestamp;
}

export interface Review {
  id: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
  ownerReply: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type NotificationType =
  | 'appointment_new'
  | 'appointment_confirmed'
  | 'appointment_rejected'
  | 'appointment_cancelled'
  | 'appointment_completed'
  | 'review_new';

export interface AppNotification {
  id: string;
  userId: string;
  senderId: string;
  title: string;
  message: string;
  type: NotificationType;
  relatedId: string;
  read: boolean;
  createdAt?: Timestamp;
}

export interface Favourite {
  id: string;
  userId: string;
  businessId: string;
  businessName: string;
  businessCategory: string;
  businessCity: string;
  businessCoverUrl: string;
  createdAt?: Timestamp;
}

export const CATEGORY_FALLBACK_IMAGES: Record<BusinessCategory, string> = {
  'Restaurants': '/src/assets/images/category_restaurant_bistro_1795540190958.jpg',
  'Hospitals and Clinics': '/src/assets/images/hero_local_discovery_1795540190905.jpg',
  'Beauty Salons': '/src/assets/images/category_salon_spa_1795540191175.jpg',
  'Shopping Stores': '/src/assets/images/hero_local_discovery_1795540190905.jpg',
  'Educational Institutions': '/src/assets/images/category_fitness_wellness_1795540191786.jpg',
  'Automobile Services': '/src/assets/images/category_auto_home_1795540192927.jpg',
  'Home Services': '/src/assets/images/category_auto_home_1795540192927.jpg',
  'Fitness Centres': '/src/assets/images/category_fitness_wellness_1795540191786.jpg',
  'Other Local Businesses': '/src/assets/images/hero_local_discovery_1795540190905.jpg',
};
