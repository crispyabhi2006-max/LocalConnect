import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createService,
  deleteNotification,
  deleteService,
  formatReadableFirestoreError,
  markNotificationRead,
  replyToReview,
  subscribeBusinessReviews,
  subscribeOwnerAppointments,
  subscribeOwnerBusiness,
  subscribeOwnerServices,
  subscribeUserNotifications,
  updateAppointmentStatus,
  updateBusinessDetails,
  updateService,
  updateUserProfile,
} from '../lib/db';
import { formatServiceFee, formatTierLabel } from '../lib/format';
import { requestFcmToken, uploadBusinessImage } from '../lib/firebase';
import {
  BUSINESS_CATEGORIES,
  CATEGORY_FALLBACK_IMAGES,
  DAY_LABELS,
  type Appointment,
  type AppNotification,
  type Business,
  type BusinessCategory,
  type DayKey,
  type OpeningHours,
  type PriceRange,
  type Review,
  type ServiceItem,
} from '../types';
import { GoogleMapsView } from '../components/GoogleMapsView';
import type { AppRoute } from '../components/Navbar';

export type OwnerTab =
  | 'dashboard'
  | 'profile'
  | 'services'
  | 'prices'
  | 'hours'
  | 'appointments'
  | 'notifications'
  | 'reviews'
  | 'settings';

interface OwnerDashboardProps {
  initialTab?: string;
  onNavigate: (route: AppRoute) => void;
  onBusinessesChanged: () => void;
  mapsConfigured: boolean;
}

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIER_VALUES: PriceRange[] = ['$', '$$', '$$$', '$$$$'];

const STATUS_BADGE: Record<Appointment['status'], string> = {
  Pending: 'text-amber-700 bg-amber-50 border-amber-200',
  Confirmed: 'text-blue-700 bg-blue-50 border-blue-200',
  Completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Cancelled: 'text-slate-600 bg-slate-100 border-slate-200',
  Rejected: 'text-rose-700 bg-rose-50 border-rose-200',
};

const TAB_TITLES: Record<OwnerTab, string> = {
  dashboard: 'Overview',
  profile: 'Business Profile & Images',
  services: 'Services',
  prices: 'Service Rates & Tiers',
  hours: 'Working Hours & Policy',
  appointments: 'Appointments & Enquiries',
  notifications: 'Activity & Notifications',
  reviews: 'Customer Reviews',
  settings: 'Account Settings',
};

export function OwnerDashboard({
  initialTab = 'dashboard',
  onNavigate,
  onBusinessesChanged,
  mapsConfigured,
}: OwnerDashboardProps) {
  const { profile, loading, refreshProfile, logout, getIdToken } = useAuth();
  const [activeTab, setActiveTab] = useState<OwnerTab>((initialTab as OwnerTab) || 'dashboard');
  const [business, setBusiness] = useState<Business | null>(null);
  const [bizLoading, setBizLoading] = useState(true);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Business edit form state
  const [bizName, setBizName] = useState('');
  const [bizCategory, setBizCategory] = useState<BusinessCategory>('Restaurants');
  const [bizPriceRange, setBizPriceRange] = useState<PriceRange>('$$');
  const [bizDescription, setBizDescription] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizCity, setBizCity] = useState('');
  const [bizPostalCode, setBizPostalCode] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizPublicEmail, setBizPublicEmail] = useState('');
  const [bizLat, setBizLat] = useState(37.7749);
  const [bizLng, setBizLng] = useState(-122.4194);
  const [bizLogoUrl, setBizLogoUrl] = useState('');
  const [bizCoverUrl, setBizCoverUrl] = useState('');
  const [bizGalleryUrls, setBizGalleryUrls] = useState<string[]>([]);
  const [newGalleryUrlInput, setNewGalleryUrlInput] = useState('');
  const [bizActive, setBizActive] = useState(true);
  const [bizFeatured, setBizFeatured] = useState(true);
  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  const [slotDuration, setSlotDuration] = useState(30);
  const [cancelPolicyHours, setCancelPolicyHours] = useState(24);

  // New service form state
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcPrice, setNewSvcPrice] = useState('50');
  const [newSvcDuration, setNewSvcDuration] = useState('30');
  const [newSvcDesc, setNewSvcDesc] = useState('');

  // Appointments filter & detail modal
  const [apptFilter, setApptFilter] = useState<'All' | Appointment['status']>('All');
  const [selectedCustomerAppt, setSelectedCustomerAppt] = useState<Appointment | null>(null);

  // Reply state
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Account settings state
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as OwnerTab);
  }, [initialTab]);

  useEffect(() => {
    if (!profile || profile.role !== 'owner') {
      setBizLoading(false);
      return;
    }

    setOwnerName(profile.name);
    setOwnerPhone(profile.phone);
    setEmailNotifications(profile.emailNotifications);
    setBizLoading(true);

    let unsubSvcs: (() => void) | null = null;
    let unsubRevs: (() => void) | null = null;
    let activeBizId = '';

    const unsubBiz = subscribeOwnerBusiness(
      profile.uid,
      (biz) => {
        setBusiness(biz);
        setBizLoading(false);
        if (biz) {
          setBizName(biz.name);
          setBizCategory(biz.category);
          setBizPriceRange(biz.priceRange);
          setBizDescription(biz.description);
          setBizAddress(biz.address);
          setBizCity(biz.city);
          setBizPostalCode(biz.postalCode);
          setBizPhone(biz.businessPhone);
          setBizPublicEmail(biz.publicEmail);
          setBizLat(biz.lat);
          setBizLng(biz.lng);
          setBizLogoUrl(biz.logoUrl);
          setBizCoverUrl(biz.coverUrl);
          setBizGalleryUrls(biz.galleryUrls || []);
          setBizActive(biz.isActive);
          setBizFeatured(biz.isFeatured);
          setOpeningHours(biz.openingHours);
          setSlotDuration(biz.slotDurationMinutes);
          setCancelPolicyHours(biz.cancellationPolicyHours);

          if (activeBizId !== biz.id) {
            activeBizId = biz.id;
            unsubSvcs?.();
            unsubRevs?.();
            unsubSvcs = subscribeOwnerServices(profile.uid, biz.id, setServices);
            unsubRevs = subscribeBusinessReviews(biz.id, setReviews);
          }
        } else {
          activeBizId = '';
          unsubSvcs?.();
          unsubRevs?.();
          setServices([]);
          setReviews([]);
        }
      },
      (err) => {
        setErrorMessage(formatReadableFirestoreError(err, 'Failed to load business dashboard.'));
        setBizLoading(false);
      }
    );

    const unsubAppts = subscribeOwnerAppointments(profile.uid, setAppointments);
    const unsubNotifs = subscribeUserNotifications(profile.uid, setNotifications);
    return () => {
      unsubBiz();
      unsubSvcs?.();
      unsubRevs?.();
      unsubAppts();
      unsubNotifs();
    };
  }, [profile]);

  const metrics = useMemo(() => {
    const total = appointments.length;
    const pending = appointments.filter((a) => a.status === 'Pending').length;
    const confirmed = appointments.filter((a) => a.status === 'Confirmed').length;
    const cancelled = appointments.filter((a) => a.status === 'Cancelled').length;
    const completed = appointments.filter((a) => a.status === 'Completed').length;
    return { total, pending, confirmed, cancelled, completed };
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    if (apptFilter === 'All') return appointments;
    return appointments.filter((a) => a.status === apptFilter);
  }, [appointments, apptFilter]);

  if (loading || bizLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0b1220]">Owner Sign In Required</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please sign in with your Business Owner account to manage your storefront and appointments.
        </p>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'owner-auth', mode: 'login' })}
          className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl cursor-pointer"
        >
          Go to Owner Sign In
        </button>
      </div>
    );
  }

  if (profile.role !== 'owner') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0b1220]">
          Business Owner Access Only
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Customer accounts cannot access Business Owner dashboards.
        </p>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'customer-dashboard', tab: 'appointments' })}
          className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl cursor-pointer"
        >
          Go to Customer Dashboard
        </button>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0b1220]">
          Complete Your Business Setup
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Your Owner account is active, but you have not published a business profile yet.
        </p>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'owner-auth', mode: 'register' })}
          className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl cursor-pointer"
        >
          Register Your Business
        </button>
      </div>
    );
  }

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bizName.trim().length < 2) {
      setErrorMessage('Business name must be at least 2 characters.');
      return;
    }
    if (bizDescription.trim().length < 10) {
      setErrorMessage('Business description must be at least 10 characters.');
      return;
    }
    if (bizPhone.trim().length < 5) {
      setErrorMessage('Business phone must be at least 5 characters.');
      return;
    }
    if (bizAddress.trim().length < 3 || bizCity.trim().length < 2 || bizPostalCode.trim().length < 2) {
      setErrorMessage('Please enter a valid street address, city, and postal code.');
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await updateBusinessDetails(business.id, {
        name: bizName,
        category: bizCategory,
        priceRange: bizPriceRange,
        description: bizDescription,
        address: bizAddress,
        city: bizCity,
        postalCode: bizPostalCode,
        businessPhone: bizPhone,
        publicEmail: bizPublicEmail,
        lat: bizLat,
        lng: bizLng,
        logoUrl: bizLogoUrl,
        coverUrl: bizCoverUrl,
        galleryUrls: bizGalleryUrls,
        isActive: bizActive,
        isFeatured: bizFeatured,
      });
      onBusinessesChanged();
      setStatusMessage('Business profile updated.');
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Failed to update business profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingHours) return;
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await updateBusinessDetails(business.id, {
        openingHours,
        slotDurationMinutes: slotDuration,
        cancellationPolicyHours: cancelPolicyHours,
      });
      onBusinessesChanged();
      setStatusMessage('Working hours and booking policies saved.');
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Failed to update working hours.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSvcName.trim().length < 2) {
      setErrorMessage('Service name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await createService({
        businessId: business.id,
        ownerId: profile.uid,
        name: newSvcName.trim(),
        description: newSvcDesc.trim(),
        price: Number(newSvcPrice) || 0,
        durationMinutes: Number(newSvcDuration) || 30,
        category: business.category,
        isActive: true,
      });
      setNewSvcName('');
      setNewSvcDesc('');
      setStatusMessage('New service added.');
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Could not add service.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAppointmentAction = async (
    appt: Appointment,
    newStatus: Appointment['status'],
    reason = ''
  ) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await updateAppointmentStatus({
        appointment: appt,
        newStatus,
        actorUid: profile.uid,
        reason,
      });

      const idToken = await getIdToken();
      if (idToken) {
        void fetch('/api/notifications/dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            recipientUid: appt.customerId,
            title: `Appointment ${newStatus}`,
            message: `${appt.serviceName} on ${appt.date} at ${appt.timeSlot} is ${newStatus}.`,
            type: `appointment_${newStatus.toLowerCase()}`,
          }),
        });
      }

      setStatusMessage(`Appointment marked as ${newStatus} and customer notified.`);
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Failed to update appointment.'));
    }
  };

  const handleUploadImage = async (file: File, kind: 'logos' | 'covers' | 'gallery') => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const url = await uploadBusinessImage(file, kind, profile.uid);
      if (kind === 'logos') setBizLogoUrl(url);
      if (kind === 'covers') setBizCoverUrl(url);
      if (kind === 'gallery') {
        setBizGalleryUrls((prev) => [...prev, url].slice(0, 10));
      }
      setStatusMessage('Image uploaded. Click Save Business Profile to publish changes.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const navGroups: Array<{
    group: string;
    items: Array<{ id: OwnerTab; label: string; icon: React.ComponentType<{ className?: string }> }>;
  }> = [
    {
      group: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        { id: 'appointments', label: 'Appointments', icon: CalendarClock },
        { id: 'notifications', label: 'Activity & Alerts', icon: Bell },
      ],
    },
    {
      group: 'Storefront',
      items: [
        { id: 'profile', label: 'Profile & Images', icon: Building2 },
        { id: 'services', label: 'Services', icon: ListChecks },
        { id: 'prices', label: 'Rates & Tiers', icon: SlidersHorizontal },
        { id: 'hours', label: 'Opening Hours', icon: Clock },
      ],
    },
    {
      group: 'Community',
      items: [
        { id: 'reviews', label: 'Customer Reviews', icon: Star },
        { id: 'settings', label: 'Account Settings', icon: Settings },
      ],
    },
  ];

  const completenessChecklist = [
    {
      label: 'Public visibility enabled',
      done: business.isActive,
      actionTab: 'profile' as OwnerTab,
    },
    {
      label: 'Cover image configured',
      done: Boolean(business.coverUrl),
      actionTab: 'profile' as OwnerTab,
    },
    {
      label: `${services.length} service${services.length === 1 ? '' : 's'} published`,
      done: services.length > 0,
      actionTab: 'services' as OwnerTab,
    },
    {
      label: 'Operating hours & slot interval set',
      done: Boolean(business.openingHours && business.slotDurationMinutes > 0),
      actionTab: 'hours' as OwnerTab,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 flex flex-col lg:flex-row">
      {/* Linear-Inspired Left Sidebar */}
      <aside className="lg:w-64 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200/90 flex flex-col justify-between">
        <div className="p-4 space-y-5">
          {/* Workspace Identity */}
          <div className="px-2.5 py-2 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3">
            {business.logoUrl ? (
              <img
                src={business.logoUrl}
                alt={business.name}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
                {business.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-display font-bold text-sm text-[#0b1220] truncate">
                {business.name}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {business.isActive ? 'Public Listing' : 'Hidden Draft'} · {business.city}
              </p>
            </div>
          </div>

          {/* Mobile Horizontal Tab Strip */}
          <div className="flex lg:hidden gap-1.5 overflow-x-auto pb-1">
            {navGroups.flatMap((g) =>
              g.items.map((item) => {
                const Icon = item.icon;
                const badge =
                  item.id === 'appointments'
                    ? metrics.pending
                    : item.id === 'notifications'
                    ? unreadNotifs
                    : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setStatusMessage(null);
                      setErrorMessage(null);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      activeTab === item.id
                        ? 'bg-[#0b1220] text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    {badge > 0 && <span className="font-mono tabular-nums">({badge})</span>}
                  </button>
                );
              })
            )}
          </div>

          {/* Desktop Grouped Navigation */}
          <nav className="hidden lg:block space-y-5">
            {navGroups.map((group) => (
              <div key={group.group}>
                <p className="px-2.5 text-[11px] font-semibold text-slate-400 mb-1.5">
                  {group.group}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const badge =
                      item.id === 'appointments'
                        ? metrics.pending
                        : item.id === 'notifications'
                        ? unreadNotifs
                        : 0;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setStatusMessage(null);
                          setErrorMessage(null);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-indigo-50/90 text-indigo-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-100/70 hover:text-[#0b1220]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {badge > 0 && (
                          <span className="text-[11px] font-mono font-semibold text-indigo-700 bg-indigo-100/80 px-1.5 py-0.5 rounded-md tabular-nums">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-slate-200/80 space-y-1">
          <button
            type="button"
            onClick={() => onNavigate({ name: 'business', businessId: business.id })}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] font-medium text-slate-700 hover:bg-slate-100/70 transition-colors cursor-pointer"
          >
            <span>View Public Listing</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => void logout().then(() => onNavigate({ name: 'home' }))}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Linear Workspace Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Bar */}
        <div className="bg-white border-b border-slate-200/80 px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-400 font-medium hidden sm:inline">Owner Studio</span>
            <span className="text-slate-300 hidden sm:inline">/</span>
            <span className="font-display font-semibold text-[#0b1220] truncate">
              {TAB_TITLES[activeTab]}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'business', businessId: business.id })}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              Preview Listing
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Service
            </button>
          </div>
        </div>

        {/* Workspace Content */}
        <main className="p-4 sm:p-8 max-w-6xl w-full space-y-6">
          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between gap-3">
              <span>{statusMessage}</span>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-700 hover:text-rose-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 1. Dashboard Overview */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Welcome Section */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-indigo-600">
                    {business.category} · {business.city}
                  </p>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#0b1220] mt-1">
                    Welcome back, {profile.name}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Manage your {business.name} storefront, track customer requests, and keep your
                    services up to date.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('profile')}
                    className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap cursor-pointer"
                  >
                    Edit Business Profile
                  </button>
                </div>
              </div>

              {/* Overview Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-500">Profile Views</p>
                  <p className="font-mono text-2xl font-bold text-[#0b1220] mt-1.5 tabular-nums">
                    {business.viewCount}
                  </p>
                </div>
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-500">Total Bookings</p>
                  <p className="font-mono text-2xl font-bold text-[#0b1220] mt-1.5 tabular-nums">
                    {metrics.total}
                  </p>
                </div>
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
                  <p className="text-xs font-medium text-amber-600">Pending Requests</p>
                  <p className="font-mono text-2xl font-bold text-[#0b1220] mt-1.5 tabular-nums">
                    {metrics.pending}
                  </p>
                </div>
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4">
                  <p className="text-xs font-medium text-blue-600">Confirmed</p>
                  <p className="font-mono text-2xl font-bold text-[#0b1220] mt-1.5 tabular-nums">
                    {metrics.confirmed}
                  </p>
                </div>
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4 col-span-2 sm:col-span-1">
                  <p className="text-xs font-medium text-slate-500">Customer Rating</p>
                  <p className="font-mono text-2xl font-bold text-[#0b1220] mt-1.5 tabular-nums">
                    {business.reviewCount > 0 ? business.ratingAvg.toFixed(1) : 'New'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                    {business.reviewCount} {business.reviewCount === 1 ? 'review' : 'reviews'}
                  </p>
                </div>
              </div>

              {/* Main 2-Column Linear Workspace Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Recent Booking Requests */}
                <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-base font-bold text-[#0b1220]">
                      Recent Customer Requests
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('appointments')}
                      className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      View all requests
                    </button>
                  </div>
                  {appointments.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm font-medium text-slate-700">
                        No appointment requests yet
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Share your LocalConnect listing to start receiving customer bookings.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {appointments.slice(0, 5).map((appt) => (
                        <div
                          key={appt.id}
                          className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 -mx-2 px-2 rounded-lg transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#0b1220] truncate">
                              {appt.customerName} — {appt.serviceName}
                            </p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                              {appt.date} at {appt.timeSlot}
                              {appt.servicePrice > 0
                                ? ` · Fee ${formatServiceFee(appt.servicePrice)}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 text-xs font-semibold border rounded-md ${
                                STATUS_BADGE[appt.status]
                              }`}
                            >
                              {appt.status}
                            </span>
                            {appt.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleAppointmentAction(appt, 'Confirmed')}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleAppointmentAction(
                                      appt,
                                      'Rejected',
                                      'Slot unavailable'
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Business Profile Status & Recent Activity */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Business Profile Status */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-base font-bold text-[#0b1220]">
                        Profile Status
                      </h2>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                          business.isActive
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-slate-600 bg-slate-100 border-slate-200'
                        }`}
                      >
                        {business.isActive ? 'Live' : 'Hidden'}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {completenessChecklist.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setActiveTab(item.actionTab)}
                          className="w-full flex items-center justify-between text-left text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-slate-700">
                            <CheckCircle2
                              className={`w-4 h-4 shrink-0 ${
                                item.done ? 'text-emerald-600' : 'text-slate-300'
                              }`}
                            />
                            <span>{item.label}</span>
                          </span>
                          <span className="text-indigo-600 font-medium">Edit</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customer Enquiries & Activity */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-base font-bold text-[#0b1220]">
                        Customer Activity
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('notifications')}
                        className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                      >
                        See all
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">
                        Recent booking alerts and customer reviews will appear here.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {notifications.slice(0, 4).map((n) => (
                          <div key={n.id} className="py-2.5">
                            <p className="text-xs font-semibold text-[#0b1220] truncate">
                              {n.title}
                            </p>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                              {n.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. My Business Profile & Image Management */}
          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-[#0b1220]">
                  Business Profile & Imagery
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Update public storefront details, images, and Google Maps coordinates.
                </p>
              </div>

              <form onSubmit={handleSaveBusinessProfile} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Business Name
                    </label>
                    <input
                      type="text"
                      required
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Category
                    </label>
                    <select
                      value={bizCategory}
                      onChange={(e) => setBizCategory(e.target.value as BusinessCategory)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                    >
                      {BUSINESS_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={bizPhone}
                      onChange={(e) => setBizPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Public Email
                    </label>
                    <input
                      type="email"
                      value={bizPublicEmail}
                      onChange={(e) => setBizPublicEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={bizDescription}
                      onChange={(e) => setBizDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Street Address
                    </label>
                    <input
                      type="text"
                      required
                      value={bizAddress}
                      onChange={(e) => setBizAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        City
                      </label>
                      <input
                        type="text"
                        required
                        value={bizCity}
                        onChange={(e) => setBizCity(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Postal Code
                      </label>
                      <input
                        type="text"
                        required
                        value={bizPostalCode}
                        onChange={(e) => setBizPostalCode(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Imagery Upload & Previews */}
                <div className="pt-4 border-t border-slate-100 space-y-5">
                  <div className="flex items-center gap-2">
                    <ImagePlus className="w-4 h-4 text-indigo-600" />
                    <h2 className="font-display text-sm font-bold text-[#0b1220]">
                      Storefront Imagery & Gallery
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Logo Image (Upload or URL)
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center">
                          {bizLogoUrl ? (
                            <img
                              src={bizLogoUrl}
                              alt="Business logo"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Building2 className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadImage(f, 'logos');
                          }}
                          className="block w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-800"
                        />
                      </div>
                      <input
                        type="url"
                        value={bizLogoUrl}
                        onChange={(e) => setBizLogoUrl(e.target.value)}
                        placeholder="Logo URL"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Cover Photo (Upload or URL)
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-14 rounded-xl border border-slate-200 bg-white overflow-hidden shrink-0">
                          <img
                            src={bizCoverUrl || CATEGORY_FALLBACK_IMAGES[bizCategory]}
                            alt="Cover preview"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadImage(f, 'covers');
                          }}
                          className="block w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-800"
                        />
                      </div>
                      <input
                        type="url"
                        value={bizCoverUrl}
                        onChange={(e) => setBizCoverUrl(e.target.value)}
                        placeholder="Cover URL"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Gallery Images Manager */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Gallery Photos ({bizGalleryUrls.length}/10)
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUploadImage(f, 'gallery');
                        }}
                        className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-800"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={newGalleryUrlInput}
                        onChange={(e) => setNewGalleryUrlInput(e.target.value)}
                        placeholder="Paste additional gallery photo URL..."
                        className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newGalleryUrlInput.trim();
                          if (!trimmed) return;
                          setBizGalleryUrls((prev) => [...prev, trimmed].slice(0, 10));
                          setNewGalleryUrlInput('');
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer"
                      >
                        Add Photo
                      </button>
                    </div>
                    {bizGalleryUrls.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-1">
                        {bizGalleryUrls.map((url, idx) => (
                          <div
                            key={`${url}-${idx}`}
                            className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white group"
                          >
                            <img
                              src={url}
                              alt={`Gallery ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setBizGalleryUrls((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label="Remove gallery photo"
                              className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/75 text-white hover:bg-rose-600 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    Map Pin Location (click map to update coordinates: {bizLat.toFixed(4)},{' '}
                    {bizLng.toFixed(4)})
                  </p>
                  <div className="rounded-2xl overflow-hidden border border-slate-200">
                    <GoogleMapsView
                      center={{ lat: bizLat, lng: bizLng }}
                      zoom={14}
                      heightClass="h-[240px]"
                      interactivePicker
                      pickedLocation={{ lat: bizLat, lng: bizLng }}
                      onPickLocation={(coords) => {
                        setBizLat(coords.lat);
                        setBizLng(coords.lng);
                      }}
                      mapsConfigured={mapsConfigured}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bizActive}
                      onChange={(e) => setBizActive(e.target.checked)}
                    />
                    Listing visible in public directory
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bizFeatured}
                      onChange={(e) => setBizFeatured(e.target.checked)}
                    />
                    Show in Featured Businesses
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Business Profile'}
                </button>
              </form>
            </div>
          )}

          {/* 3. Manage Services */}
          {activeTab === 'services' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-[#0b1220]">Manage Services</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add, pause, or remove services displayed on your public storefront.
                </p>
              </div>

              <form
                onSubmit={handleAddService}
                className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3"
              >
                <input
                  type="text"
                  required
                  value={newSvcName}
                  onChange={(e) => setNewSvcName(e.target.value)}
                  placeholder="Service name"
                  className="sm:col-span-4 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={newSvcPrice}
                  onChange={(e) => setNewSvcPrice(e.target.value)}
                  placeholder="Fee"
                  className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                />
                <input
                  type="number"
                  min="5"
                  step="5"
                  required
                  value={newSvcDuration}
                  onChange={(e) => setNewSvcDuration(e.target.value)}
                  placeholder="Mins"
                  className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                />
                <input
                  type="text"
                  value={newSvcDesc}
                  onChange={(e) => setNewSvcDesc(e.target.value)}
                  placeholder="Description"
                  className="sm:col-span-3 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={saving}
                  aria-label="Add service"
                  className="sm:col-span-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {services.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500 text-center">
                    No services published yet. Add your first service above.
                  </p>
                ) : (
                  services.map((svc) => (
                    <div
                      key={svc.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white hover:bg-slate-50/50 transition-colors"
                    >
                      <div>
                        <p className="font-semibold text-sm text-[#0b1220]">
                          {svc.name}{' '}
                          {!svc.isActive && (
                            <span className="text-xs text-slate-400 font-normal">(Paused)</span>
                          )}
                        </p>
                        {svc.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{svc.description}</p>
                        )}
                        <p className="text-xs font-mono text-slate-600 mt-1 tabular-nums">
                          {svc.durationMinutes} min
                          {svc.price > 0 ? ` · Fee ${formatServiceFee(svc.price)}` : ' · Complimentary'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await updateService(svc.id, { isActive: !svc.isActive });
                              setStatusMessage(
                                `${svc.name} is now ${!svc.isActive ? 'active' : 'paused'}.`
                              );
                            } catch (err) {
                              setErrorMessage(
                                formatReadableFirestoreError(err, 'Could not update service.')
                              );
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          {svc.isActive ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await deleteService(svc.id);
                            } catch (err) {
                              setErrorMessage(
                                formatReadableFirestoreError(err, 'Could not delete service.')
                              );
                            }
                          }}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 4. Service Rates & Tiers */}
          {activeTab === 'prices' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-[#0b1220]">
                    Service Rates & Tiers
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Adjust individual service fees, durations, and your overall directory tier.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Experience Tier:</span>
                  {TIER_VALUES.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={async () => {
                        const prevTier = bizPriceRange;
                        setBizPriceRange(tier);
                        setErrorMessage(null);
                        try {
                          await updateBusinessDetails(business.id, { priceRange: tier });
                          onBusinessesChanged();
                          setStatusMessage(`Experience tier updated to ${formatTierLabel(tier)}.`);
                        } catch (err) {
                          setBizPriceRange(prevTier);
                          setErrorMessage(
                            formatReadableFirestoreError(err, 'Could not update experience tier.')
                          );
                        }
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
                        bizPriceRange === tier
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {formatTierLabel(tier)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="p-4 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <span className="sm:col-span-6 text-sm font-semibold text-[#0b1220]">
                      {svc.name}
                    </span>
                    <div className="sm:col-span-3">
                      <label className="text-[11px] text-slate-500 block mb-1">Service Fee</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={svc.price}
                        onBlur={async (e) => {
                          const val = Number(e.target.value);
                          if (!Number.isNaN(val) && val !== svc.price) {
                            setErrorMessage(null);
                            try {
                              await updateService(svc.id, { price: val });
                              setStatusMessage(`Updated rate for ${svc.name}.`);
                            } catch (err) {
                              setErrorMessage(
                                formatReadableFirestoreError(err, 'Could not update service rate.')
                              );
                            }
                          }
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        min="5"
                        step="5"
                        defaultValue={svc.durationMinutes}
                        onBlur={async (e) => {
                          const val = Number(e.target.value);
                          if (!Number.isNaN(val) && val !== svc.durationMinutes) {
                            setErrorMessage(null);
                            try {
                              await updateService(svc.id, { durationMinutes: val });
                              setStatusMessage(`Updated duration for ${svc.name}.`);
                            } catch (err) {
                              setErrorMessage(
                                formatReadableFirestoreError(
                                  err,
                                  'Could not update service duration.'
                                )
                              );
                            }
                          }
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Manage Working Hours */}
          {activeTab === 'hours' && openingHours && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220]">
                Manage Working Hours
              </h1>
              <form onSubmit={handleSaveHours} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Appointment Slot Interval
                    </label>
                    <select
                      value={slotDuration}
                      onChange={(e) => setSlotDuration(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Cancellation Policy Notice
                    </label>
                    <select
                      value={cancelPolicyHours}
                      onChange={(e) => setCancelPolicyHours(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                    >
                      <option value={0}>Flexible (anytime)</option>
                      <option value={2}>2 hours prior</option>
                      <option value={12}>12 hours prior</option>
                      <option value={24}>24 hours prior</option>
                      <option value={48}>48 hours prior</option>
                    </select>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {DAY_ORDER.map((day) => {
                    const h = openingHours[day];
                    return (
                      <div
                        key={day}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                      >
                        <span className="font-medium text-slate-800 w-28">{DAY_LABELS[day]}</span>
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={h.closed}
                            onChange={(e) =>
                              setOpeningHours((prev) =>
                                prev
                                  ? { ...prev, [day]: { ...prev[day], closed: e.target.checked } }
                                  : prev
                              )
                            }
                          />
                          Closed
                        </label>
                        {!h.closed && (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={h.open}
                              onChange={(e) =>
                                setOpeningHours((prev) =>
                                  prev
                                    ? { ...prev, [day]: { ...prev[day], open: e.target.value } }
                                    : prev
                                )
                              }
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono"
                            />
                            <span className="text-slate-400">to</span>
                            <input
                              type="time"
                              value={h.close}
                              onChange={(e) =>
                                setOpeningHours((prev) =>
                                  prev
                                    ? { ...prev, [day]: { ...prev[day], close: e.target.value } }
                                    : prev
                                )
                              }
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Working Hours'}
                </button>
              </form>
            </div>
          )}

          {/* 6. Appointment Requests */}
          {activeTab === 'appointments' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-xl font-bold text-[#0b1220]">
                  Appointment Requests
                </h1>
                <div className="flex flex-wrap gap-1.5">
                  {(['All', 'Pending', 'Confirmed', 'Completed', 'Rejected', 'Cancelled'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setApptFilter(st)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                          apptFilter === st
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>
              </div>

              {filteredAppointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments in this filter.</p>
              ) : (
                <div className="space-y-3">
                  {filteredAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-sm text-[#0b1220]">
                            {appt.customerName}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold border rounded-md ${
                              STATUS_BADGE[appt.status]
                            }`}
                          >
                            {appt.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mt-1">
                          {appt.serviceName}
                          {appt.servicePrice > 0 && (
                            <span className="font-mono text-slate-500 tabular-nums">
                              {' '}
                              · Fee {formatServiceFee(appt.servicePrice)}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {appt.date} at {appt.timeSlot} ({appt.durationMinutes} min)
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerAppt(appt)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          Customer Details
                        </button>
                        {appt.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleAppointmentAction(appt, 'Confirmed')}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleAppointmentAction(appt, 'Rejected', 'Declined by owner')
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {appt.status === 'Confirmed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleAppointmentAction(appt, 'Completed')}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                            >
                              Mark Completed
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleAppointmentAction(
                                  appt,
                                  'Cancelled',
                                  'Cancelled by business owner'
                                )
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. Notifications */}
          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220] mb-6">
                Activity & Notifications
              </h1>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">No notifications yet.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 border rounded-xl flex items-start justify-between gap-4 ${
                        n.read ? 'bg-white border-slate-200' : 'bg-indigo-50/50 border-indigo-200'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0b1220]">{n.title}</p>
                        <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() =>
                              void markNotificationRead(n.id).catch((err) =>
                                setErrorMessage(
                                  formatReadableFirestoreError(err, 'Could not mark notification read.')
                                )
                              )
                            }
                            className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void deleteNotification(n.id).catch((err) =>
                              setErrorMessage(
                                formatReadableFirestoreError(err, 'Could not delete notification.')
                              )
                            )
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. Reviews */}
          {activeTab === 'reviews' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-5">
              <h1 className="font-display text-xl font-bold text-[#0b1220]">
                Customer Reviews ({reviews.length})
              </h1>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">No customer reviews yet.</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="p-4 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-[#0b1220]">
                          {rev.customerName}
                        </span>
                        <span className="text-xs font-semibold text-amber-600 tabular-nums">
                          {rev.rating}.0 ★
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{rev.comment}</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyDrafts[rev.id] ?? rev.ownerReply}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))
                          }
                          placeholder="Write an owner response..."
                          className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const text = replyDrafts[rev.id] ?? rev.ownerReply;
                            setErrorMessage(null);
                            try {
                              await replyToReview(rev.id, text);
                              setStatusMessage('Owner reply saved.');
                            } catch (err) {
                              setErrorMessage(
                                formatReadableFirestoreError(err, 'Could not save review reply.')
                              );
                            }
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0b1220] hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          Save Reply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 9. Account Settings */}
          {activeTab === 'settings' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220]">Account Settings</h1>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  setErrorMessage(null);
                  setStatusMessage(null);
                  try {
                    await updateUserProfile(profile.uid, {
                      name: ownerName,
                      phone: ownerPhone,
                      emailNotifications,
                    });
                    await refreshProfile();
                    setStatusMessage('Owner account settings saved.');
                  } catch (err) {
                    setErrorMessage(
                      formatReadableFirestoreError(err, 'Could not save owner settings.')
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                className="space-y-4 max-w-lg"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Owner Name
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Owner Phone
                  </label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                  />
                </div>
                <label className="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer">
                  <span className="text-sm font-medium text-slate-800">
                    Booking Notification Alerts
                  </span>
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer"
                  >
                    Save Settings
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setErrorMessage(null);
                      setStatusMessage(null);
                      try {
                        const res = await requestFcmToken();
                        if (!res.token) {
                          setErrorMessage(res.reason || 'Push notifications not configured.');
                        } else {
                          await updateUserProfile(profile.uid, {
                            pushNotifications: true,
                            fcmToken: res.token,
                          });
                          await refreshProfile();
                          setStatusMessage('Browser push notifications activated.');
                        }
                      } catch (err) {
                        setErrorMessage(
                          formatReadableFirestoreError(
                            err,
                            'Could not activate push notifications.'
                          )
                        );
                      }
                    }}
                    className="px-4 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl cursor-pointer"
                  >
                    Enable Push Alerts
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerAppt && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-[#0b1220]">Customer Details</h3>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="text-slate-500">Name:</span>{' '}
                <strong>{selectedCustomerAppt.customerName}</strong>
              </p>
              <p>
                <span className="text-slate-500">Email:</span> {selectedCustomerAppt.customerEmail}
              </p>
              <p>
                <span className="text-slate-500">Phone:</span> {selectedCustomerAppt.customerPhone}
              </p>
              <p>
                <span className="text-slate-500">Service:</span> {selectedCustomerAppt.serviceName}
                {selectedCustomerAppt.servicePrice > 0
                  ? ` (Fee ${formatServiceFee(selectedCustomerAppt.servicePrice)})`
                  : ''}
              </p>
              <p>
                <span className="text-slate-500">Requested Time:</span> {selectedCustomerAppt.date}{' '}
                at {selectedCustomerAppt.timeSlot}
              </p>
              {selectedCustomerAppt.notes && (
                <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <span className="font-semibold block mb-1">Customer Notes:</span>
                  {selectedCustomerAppt.notes}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedCustomerAppt(null)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#0b1220] hover:bg-slate-800 rounded-xl cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
