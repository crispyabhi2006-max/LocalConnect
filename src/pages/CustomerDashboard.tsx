import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  Check,
  Heart,
  History,
  LogOut,
  Settings,
  Star,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  deleteNotification,
  deleteReview,
  fetchBusinessById,
  formatReadableFirestoreError,
  markNotificationRead,
  subscribeCustomerAppointments,
  subscribeCustomerFavourites,
  subscribeCustomerReviews,
  subscribeUserNotifications,
  toggleFavouriteBusiness,
  updateAppointmentStatus,
  updateUserProfile,
} from '../lib/db';
import { formatServiceFee } from '../lib/format';
import { requestFcmToken } from '../lib/firebase';
import type { Appointment, AppNotification, Favourite, Review } from '../types';
import type { AppRoute } from '../components/Navbar';

export type CustomerTab =
  | 'profile'
  | 'appointments'
  | 'history'
  | 'favourites'
  | 'notifications'
  | 'reviews'
  | 'settings';

interface CustomerDashboardProps {
  initialTab?: string;
  onNavigate: (route: AppRoute) => void;
}

const STATUS_BADGE_STYLES: Record<Appointment['status'], string> = {
  Pending: 'text-amber-700 bg-amber-50 border-amber-200',
  Confirmed: 'text-blue-700 bg-blue-50 border-blue-200',
  Completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Cancelled: 'text-slate-600 bg-slate-100 border-slate-200',
  Rejected: 'text-rose-700 bg-rose-50 border-rose-200',
};

export function CustomerDashboard({ initialTab = 'appointments', onNavigate }: CustomerDashboardProps) {
  const { profile, loading, refreshProfile, logout, getIdToken } = useAuth();
  const [activeTab, setActiveTab] = useState<CustomerTab>((initialTab as CustomerTab) || 'appointments');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Profile / Settings edit state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as CustomerTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone);
      setCity(profile.city);
      setEmailNotifications(profile.emailNotifications);
      setPushNotifications(profile.pushNotifications);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== 'customer') return;
    const unsubAppts = subscribeCustomerAppointments(profile.uid, setAppointments);
    const unsubFavs = subscribeCustomerFavourites(profile.uid, setFavourites);
    const unsubNotifs = subscribeUserNotifications(profile.uid, setNotifications);
    const unsubReviews = subscribeCustomerReviews(profile.uid, setReviews);

    return () => {
      unsubAppts();
      unsubFavs();
      unsubNotifs();
      unsubReviews();
    };
  }, [profile]);

  const activeAppointments = useMemo(
    () => appointments.filter((a) => a.status === 'Pending' || a.status === 'Confirmed'),
    [appointments]
  );

  const historyAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => a.status === 'Completed' || a.status === 'Cancelled' || a.status === 'Rejected'
      ),
    [appointments]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0b1220]">Sign In Required</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please sign in with your Customer account to view your appointments and saved businesses.
        </p>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'customer-auth', mode: 'login' })}
          className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl cursor-pointer"
        >
          Go to Customer Sign In
        </button>
      </div>
    );
  }

  if (profile.role !== 'customer') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0b1220]">Customer Access Only</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in with a Business Owner account. Customers and Business Owners use
          separate portals.
        </p>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'owner-dashboard', tab: 'dashboard' })}
          className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl cursor-pointer"
        >
          Open Business Owner Studio
        </button>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await updateUserProfile(profile.uid, { name, phone, city });
      await refreshProfile();
      setStatusMessage('Profile details saved.');
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Unable to save profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAppointment = async (appt: Appointment) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const biz = await fetchBusinessById(appt.businessId);
      const policyHours = biz?.cancellationPolicyHours ?? 0;

      const idToken = await getIdToken();
      if (idToken) {
        const res = await fetch('/api/appointments/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            action: 'cancel',
            date: appt.date,
            timeSlot: appt.timeSlot,
            cancellationPolicyHours: policyHours,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || 'Cancellation violates business policy window.');
        }
      }

      await updateAppointmentStatus({
        appointment: appt,
        newStatus: 'Cancelled',
        actorUid: profile.uid,
        reason: 'Cancelled by customer',
      });
      setStatusMessage(`Cancelled appointment for ${appt.serviceName} on ${appt.date}.`);
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Could not cancel appointment.'));
    }
  };

  const handleEnablePush = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { token, reason } = await requestFcmToken();
      if (!token) {
        setErrorMessage(reason || 'Push notifications are not configured.');
        return;
      }
      await updateUserProfile(profile.uid, { pushNotifications: true, fcmToken: token });
      await refreshProfile();
      setStatusMessage('Push notifications enabled for this browser.');
    } catch (err) {
      setErrorMessage(formatReadableFirestoreError(err, 'Could not enable push notifications.'));
    }
  };

  const navItems: Array<{ id: CustomerTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'appointments', label: 'My Appointments', icon: Calendar },
    { id: 'history', label: 'Booking History', icon: History },
    { id: 'favourites', label: 'Saved Places', icon: Heart },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'settings', label: 'Account Settings', icon: Settings },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-3">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-1">
            <div className="px-3 py-3 border-b border-slate-100 mb-2">
              <p className="text-xs font-medium text-blue-600">Customer Portal</p>
              <p className="font-display font-bold text-[#0b1220] truncate mt-0.5">{profile.name}</p>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const unread =
                item.id === 'notifications'
                  ? notifications.filter((n) => !n.read).length
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
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-[#0b1220]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {unread > 0 && (
                    <span className="text-xs font-mono font-semibold text-blue-600 tabular-nums">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => void logout().then(() => onNavigate({ name: 'home' }))}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 mt-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="lg:col-span-9 space-y-6">
          {statusMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          {/* 1. My Appointments */}
          {activeTab === 'appointments' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h1 className="font-display text-xl font-bold text-[#0b1220]">My Appointments</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pending and confirmed upcoming reservations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'search' })}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
                >
                  Book New Appointment
                </button>
              </div>

              {activeAppointments.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">No upcoming appointments</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Explore local businesses to schedule your next visit.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({ name: 'business', businessId: appt.businessId })
                            }
                            className="font-display font-bold text-base text-[#0b1220] hover:text-blue-600 cursor-pointer"
                          >
                            {appt.businessName}
                          </button>
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold border rounded-md ${
                              STATUS_BADGE_STYLES[appt.status]
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
                        <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                          {appt.date} at {appt.timeSlot} ({appt.durationMinutes} min)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCancelAppointment(appt)}
                          className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer"
                        >
                          Cancel Appointment
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Booking History */}
          {activeTab === 'history' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220] mb-1">Booking History</h1>
              <p className="text-xs text-slate-500 mb-6">
                Completed, cancelled, and declined appointment records.
              </p>

              {historyAppointments.length === 0 ? (
                <p className="text-sm text-slate-500">No historical bookings yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-2.5 pr-4 font-semibold">Business</th>
                        <th className="py-2.5 pr-4 font-semibold">Service</th>
                        <th className="py-2.5 pr-4 font-semibold">Date & Time</th>
                        <th className="py-2.5 pr-4 font-semibold text-right">Fee</th>
                        <th className="py-2.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyAppointments.map((appt) => (
                        <tr key={appt.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-4 font-medium text-[#0b1220]">
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate({ name: 'business', businessId: appt.businessId })
                              }
                              className="hover:text-blue-600 cursor-pointer"
                            >
                              {appt.businessName}
                            </button>
                          </td>
                          <td className="py-3 pr-4 text-slate-600">{appt.serviceName}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-600 tabular-nums">
                            {appt.date} {appt.timeSlot}
                          </td>
                          <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-700">
                            {formatServiceFee(appt.servicePrice)}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 text-xs font-semibold border rounded-md ${
                                STATUS_BADGE_STYLES[appt.status]
                              }`}
                            >
                              {appt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. Favourite Businesses */}
          {activeTab === 'favourites' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220] mb-1">
                Saved Places
              </h1>
              <p className="text-xs text-slate-500 mb-6">
                Quick access to your saved neighborhood storefronts.
              </p>
              {favourites.length === 0 ? (
                <p className="text-sm text-slate-500">
                  You have not saved any businesses yet. Tap the heart icon on any listing to save
                  it here.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {favourites.map((fav) => (
                    <div
                      key={fav.id}
                      className="border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-300 transition-colors"
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({ name: 'business', businessId: fav.businessId })
                          }
                          className="font-display font-bold text-[#0b1220] hover:text-blue-600 text-left cursor-pointer"
                        >
                          {fav.businessName}
                        </button>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fav.businessCategory} · {fav.businessCity}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setErrorMessage(null);
                          try {
                            const biz = await fetchBusinessById(fav.businessId);
                            if (biz) {
                              await toggleFavouriteBusiness(profile.uid, biz, true);
                            }
                          } catch (err) {
                            setErrorMessage(formatReadableFirestoreError(err, 'Could not remove favourite.'));
                          }
                        }}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="Remove from saved"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Notifications */}
          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220] mb-1">Notifications</h1>
              <p className="text-xs text-slate-500 mb-6">
                Real-time appointment confirmations and status updates.
              </p>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">You have no notifications yet.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 border rounded-xl flex items-start justify-between gap-4 ${
                        n.read ? 'bg-white border-slate-200' : 'bg-blue-50/50 border-blue-200'
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
                                setErrorMessage(formatReadableFirestoreError(err, 'Could not update notification.'))
                              )
                            }
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg cursor-pointer"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void deleteNotification(n.id).catch((err) =>
                              setErrorMessage(formatReadableFirestoreError(err, 'Could not delete notification.'))
                            )
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          title="Delete"
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

          {/* 5. Reviews */}
          {activeTab === 'reviews' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220] mb-1">My Reviews</h1>
              <p className="text-xs text-slate-500 mb-6">
                Reviews you have published for local businesses.
              </p>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">You have not written any reviews yet.</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="p-4 border border-slate-200 rounded-xl flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({ name: 'business', businessId: rev.businessId })
                            }
                            className="font-semibold text-sm text-[#0b1220] hover:text-blue-600 cursor-pointer"
                          >
                            {rev.businessName}
                          </button>
                          <span className="text-xs font-semibold text-amber-600 tabular-nums">
                            {rev.rating}.0 ★
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{rev.comment}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setErrorMessage(null);
                          try {
                            await deleteReview(rev.id, rev.businessId);
                            setReviews((prev) => prev.filter((r) => r.id !== rev.id));
                          } catch (err) {
                            setErrorMessage(formatReadableFirestoreError(err, 'Could not delete review.'));
                          }
                        }}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. My Profile */}
          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6">
              <h1 className="font-display text-xl font-bold text-[#0b1220] mb-6">My Profile</h1>
              <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    disabled
                    value={profile.email}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>
          )}

          {/* 7. Account Settings */}
          {activeTab === 'settings' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-[#0b1220]">Account Settings</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Notification delivery and browser push preferences.
                </p>
              </div>
              <div className="space-y-4 max-w-lg">
                <label className="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-[#0b1220]">Appointment Alerts</p>
                    <p className="text-xs text-slate-500">
                      Receive instant updates when an owner confirms or updates a booking.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setEmailNotifications(next);
                      setErrorMessage(null);
                      try {
                        await updateUserProfile(profile.uid, { emailNotifications: next });
                        await refreshProfile();
                      } catch (err) {
                        setEmailNotifications(!next);
                        setErrorMessage(formatReadableFirestoreError(err, 'Could not update alert preference.'));
                      }
                    }}
                  />
                </label>

                <div className="p-4 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#0b1220]">
                      Firebase Cloud Messaging (Web Push)
                    </p>
                    <p className="text-xs text-slate-500">
                      {pushNotifications
                        ? 'Browser push token is active.'
                        : 'Enable browser push alerts when configured with VAPID key.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl shrink-0 cursor-pointer"
                  >
                    Enable Push
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
