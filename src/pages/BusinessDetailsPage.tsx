import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  bookAppointmentAtomic,
  formatReadableFirestoreError,
  incrementBusinessView,
  submitReview,
  subscribeBookedSlotsForDate,
  subscribeBusinessById,
  subscribeBusinessReviews,
  subscribeBusinessServicesPublic,
} from '../lib/db';
import { formatServiceFee, formatTierLabel } from '../lib/format';
import { generateTimeSlotsForDate } from '../lib/maps';
import {
  CATEGORY_FALLBACK_IMAGES,
  DAY_LABELS,
  type Business,
  type DayKey,
  type Review,
  type ServiceItem,
} from '../types';
import { GoogleMapsView } from '../components/GoogleMapsView';
import type { AppRoute } from '../components/Navbar';

interface BusinessDetailsPageProps {
  businessId: string;
  favouriteIds: Set<string>;
  onToggleFavourite: (business: Business) => void;
  onNavigate: (route: AppRoute) => void;
  mapsConfigured: boolean;
}

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function BusinessDetailsPage({
  businessId,
  favouriteIds,
  onToggleFavourite,
  onNavigate,
  mapsConfigured,
}: BusinessDetailsPageProps) {
  const { profile, getIdToken } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);

  // Booking state
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [bookingDate, setBookingDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  });
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccessId, setBookingSuccessId] = useState<string | null>(null);

  // Review state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setCustomerName((prev) => prev || profile.name);
      setCustomerEmail((prev) => prev || profile.email);
      setCustomerPhone((prev) => prev || profile.phone);
    }
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    let viewRecorded = false;

    const unsubBiz = subscribeBusinessById(
      businessId,
      (biz) => {
        if (!biz) {
          setBusiness(null);
          setError('Business profile not found.');
          setLoading(false);
          return;
        }
        setBusiness(biz);
        setLoading(false);

        const viewedKey = `lc_viewed_${businessId}`;
        if (!viewRecorded && profile && profile.uid !== biz.ownerId && !sessionStorage.getItem(viewedKey)) {
          viewRecorded = true;
          sessionStorage.setItem(viewedKey, '1');
          void incrementBusinessView(businessId);
        }
      },
      (err) => {
        setError(formatReadableFirestoreError(err, 'Failed to load business profile.'));
        setLoading(false);
      }
    );

    const unsubSvcs = subscribeBusinessServicesPublic(
      businessId,
      (svcList) => {
        setServices(svcList);
        setSelectedServiceId((prev) =>
          prev && svcList.some((s) => s.id === prev) ? prev : svcList[0]?.id || ''
        );
      },
      (err) => {
        console.error('Failed to subscribe services:', err);
      }
    );

    const unsubRevs = subscribeBusinessReviews(
      businessId,
      (revList) => {
        setReviews(revList);
      },
      (err) => {
        console.error('Failed to subscribe reviews:', err);
      }
    );

    return () => {
      unsubBiz();
      unsubSvcs();
      unsubRevs();
    };
  }, [businessId, profile]);

  useEffect(() => {
    if (!business?.id || !bookingDate) return;
    setSlotsLoading(true);
    const unsub = subscribeBookedSlotsForDate(
      business.id,
      bookingDate,
      (taken) => {
        setBookedSlots(taken);
        setSelectedTimeSlot((prev) => (taken.includes(prev) ? '' : prev));
        setSlotsLoading(false);
      },
      () => {
        setBookedSlots([]);
        setSlotsLoading(false);
      }
    );
    return () => unsub();
  }, [business?.id, bookingDate]);

  const availableSlots = useMemo(() => {
    if (!business) return [];
    return generateTimeSlotsForDate(
      bookingDate,
      business.openingHours,
      business.slotDurationMinutes
    );
  }, [business, bookingDate]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError(null);
    setBookingSuccessId(null);

    if (!profile) {
      onNavigate({ name: 'customer-auth', mode: 'login' });
      return;
    }
    if (profile.role !== 'customer') {
      setBookingError(
        'Business Owner accounts cannot book appointments. Please sign in with a Customer account.'
      );
      return;
    }
    if (!business || !selectedService) {
      setBookingError('Please select a service first.');
      return;
    }
    if (!bookingDate || !selectedTimeSlot) {
      setBookingError('Please select an available date and time slot.');
      return;
    }
    if (customerName.trim().length < 2 || customerPhone.trim().length < 5) {
      setBookingError('Please enter your full name and a valid phone number.');
      return;
    }

    setBookingSubmitting(true);
    try {
      const idToken = await getIdToken();
      if (idToken) {
        const valRes = await fetch('/api/appointments/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            action: 'book',
            date: bookingDate,
            timeSlot: selectedTimeSlot,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        });
        if (!valRes.ok) {
          const valErr = (await valRes.json()) as { error?: string };
          throw new Error(valErr.error || 'Appointment validation failed.');
        }
      }

      const appointmentId = await bookAppointmentAtomic({
        business,
        service: selectedService,
        customerId: profile.uid,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || profile.email,
        customerPhone: customerPhone.trim(),
        date: bookingDate,
        timeSlot: selectedTimeSlot,
        notes: notes.trim(),
      });

      if (idToken) {
        void fetch('/api/notifications/dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            recipientUid: business.ownerId,
            title: `New appointment request — ${selectedService.name}`,
            message: `${customerName.trim()} requested ${bookingDate} at ${selectedTimeSlot}`,
            type: 'appointment_new',
          }),
        });
      }

      setSelectedTimeSlot('');
      setNotes('');
      setBookingSuccessId(appointmentId);
    } catch (err) {
      setBookingError(formatReadableFirestoreError(err, 'Could not submit appointment.'));
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      onNavigate({ name: 'customer-auth', mode: 'login' });
      return;
    }
    if (!business) return;
    if (reviewComment.trim().length < 3) {
      setReviewMessage('Please write at least 3 characters for your review.');
      return;
    }

    setReviewSubmitting(true);
    setReviewMessage(null);
    try {
      await submitReview({
        business,
        customerId: profile.uid,
        customerName: profile.name,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setReviewComment('');
      setReviewRating(5);
      setReviewMessage('Thank you! Your review has been published.');
    } catch (err) {
      setReviewMessage(formatReadableFirestoreError(err, 'Unable to submit review.'));
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-80 rounded-3xl bg-slate-100 animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 h-96 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="lg:col-span-5 h-96 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0b1220]">Business Not Found</h1>
        <p className="mt-2 text-sm text-slate-600">{error || 'This listing may have been removed.'}</p>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'search' })}
          className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl cursor-pointer"
        >
          Back to Directory
        </button>
      </div>
    );
  }

  const coverSrc = business.coverUrl || CATEGORY_FALLBACK_IMAGES[business.category];
  const galleryItems = (business.galleryUrls || []).filter(Boolean);
  const isFav = favouriteIds.has(business.id);
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${business.lat},${business.lng}`;

  return (
    <div className="bg-white pb-20">
      {/* Top Breadcrumb Bar */}
      <div className="border-b border-slate-200/80 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onNavigate({ name: 'search' })}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0b1220] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to directory
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors inline-flex items-center gap-1.5"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              Get Directions
            </a>
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              Contact Business
            </button>
            <button
              type="button"
              onClick={() => onToggleFavourite(business)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                isFav
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
              {isFav ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Airbnb-Style Editorial Title + Large Image Gallery */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            {business.logoUrl && (
              <img
                src={business.logoUrl}
                alt={`${business.name} logo`}
                referrerPolicy="no-referrer"
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl object-cover border border-slate-200 bg-white shrink-0 shadow-sm"
              />
            )}
            <div>
              <p className="text-xs font-semibold text-blue-600">
                {business.category} · {formatTierLabel(business.priceRange)}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0b1220] mt-1">
                {business.name}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1 font-semibold text-[#0b1220] tabular-nums">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  {business.reviewCount > 0 ? business.ratingAvg.toFixed(1) : 'New'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {business.reviewCount} {business.reviewCount === 1 ? 'review' : 'reviews'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {business.address}, {business.city} {business.postalCode}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Large Mosaic Image Gallery */}
        {galleryItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-3xl overflow-hidden border border-slate-200 bg-slate-100">
            <button
              type="button"
              onClick={() => setLightboxImg(coverSrc)}
              className="md:col-span-7 h-72 sm:h-96 overflow-hidden cursor-pointer relative group"
            >
              <img
                src={coverSrc}
                alt={business.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              />
            </button>
            <div className="md:col-span-5 grid grid-cols-2 gap-3 h-72 sm:h-96">
              {galleryItems.slice(0, 4).map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => setLightboxImg(url)}
                  className={`overflow-hidden bg-slate-100 cursor-pointer relative group ${
                    galleryItems.length === 1 ? 'col-span-2 row-span-2' : ''
                  } ${galleryItems.length === 2 ? 'col-span-2' : ''}`}
                >
                  <img
                    src={url}
                    alt={`${business.name} photo ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLightboxImg(coverSrc)}
            className="w-full h-72 sm:h-[400px] rounded-3xl overflow-hidden border border-slate-200 bg-slate-100 block cursor-pointer group"
          >
            <img
              src={coverSrc}
              alt={business.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-[1.015] transition-transform duration-300"
            />
          </button>
        )}

        {/* Main 2-Column Content */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: About, Contact & Directions, Services, Hours, Map, Reviews */}
          <div className="lg:col-span-7 space-y-10">
            {/* Description & Contact */}
            <section>
              <h2 className="font-display text-2xl font-bold text-[#0b1220]">
                About {business.name}
              </h2>
              <p className="mt-3 text-base text-slate-600 leading-relaxed whitespace-pre-line">
                {business.description}
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200/80 pt-6 text-sm">
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start gap-3">
                  <Phone className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">Phone</p>
                    <a
                      href={`tel:${business.businessPhone.replace(/[^0-9+\-().\s]/g, '')}`}
                      className="font-semibold text-[#0b1220] hover:text-blue-600 hover:underline break-all"
                    >
                      {business.businessPhone}
                    </a>
                  </div>
                </div>

                {business.publicEmail && (
                  <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start gap-3">
                    <Mail className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Email</p>
                      <a
                        href={`mailto:${business.publicEmail.replace(/[^a-zA-Z0-9._%+\-@]/g, '')}`}
                        className="font-semibold text-[#0b1220] hover:text-blue-600 hover:underline truncate block"
                      >
                        {business.publicEmail}
                      </a>
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start gap-3 sm:col-span-2">
                  <Clock className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-slate-500">Scheduling & Policy</p>
                    <p className="font-medium text-[#0b1220]">
                      Slot interval: {business.slotDurationMinutes} min · Cancellation notice:{' '}
                      {business.cancellationPolicyHours}h prior
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowContactModal(true)}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0b1220] hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Contact Business
                </button>
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  <Navigation className="w-4 h-4 text-blue-600" />
                  Get Directions
                </a>
              </div>
            </section>

            {/* Full Photo Gallery (when extra photos exist) */}
            {galleryItems.length > 0 && (
              <section className="border-t border-slate-200/80 pt-8">
                <h2 className="font-display text-xl font-bold text-[#0b1220] mb-4">
                  Photo Gallery
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {galleryItems.map((url, idx) => (
                    <button
                      key={`${url}-strip-${idx}`}
                      type="button"
                      onClick={() => setLightboxImg(url)}
                      className="aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group"
                    >
                      <img
                        src={url}
                        alt={`${business.name} gallery ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Services */}
            <section className="border-t border-slate-200/80 pt-8">
              <h2 className="font-display text-xl font-bold text-[#0b1220] mb-4">
                Services & Offerings
              </h2>
              {services.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No services have been published by this business yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200/80 border border-slate-200 rounded-2xl overflow-hidden">
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        selectedServiceId === svc.id ? 'bg-blue-50/50' : 'bg-white'
                      }`}
                    >
                      <div>
                        <p className="font-display font-semibold text-base text-[#0b1220]">
                          {svc.name}
                        </p>
                        {svc.description && (
                          <p className="text-sm text-slate-600 mt-1">{svc.description}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                          Duration: {svc.durationMinutes} min
                          {svc.category ? ` · ${svc.category}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-mono font-semibold text-sm text-slate-700 tabular-nums">
                          {svc.price > 0 ? `Fee ${formatServiceFee(svc.price)}` : 'Complimentary'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedServiceId(svc.id)}
                          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                            selectedServiceId === svc.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          }`}
                        >
                          {selectedServiceId === svc.id ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Opening Hours */}
            <section className="border-t border-slate-200/80 pt-8">
              <h2 className="font-display text-xl font-bold text-[#0b1220] mb-4">
                Opening Hours
              </h2>
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {DAY_ORDER.map((day) => {
                  const h = business.openingHours[day];
                  return (
                    <div
                      key={day}
                      className="px-4 py-3 flex items-center justify-between text-sm bg-white"
                    >
                      <span className="font-medium text-slate-800">{DAY_LABELS[day]}</span>
                      <span className="font-mono text-xs sm:text-sm text-slate-600 tabular-nums">
                        {h?.closed ? 'Closed' : `${h?.open || '09:00'} – ${h?.close || '18:00'}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Map Location */}
            <section className="border-t border-slate-200/80 pt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-bold text-[#0b1220]">Where You'll Find Us</h2>
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Get Directions
                </a>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-200">
                <GoogleMapsView
                  businesses={[business]}
                  center={{ lat: business.lat, lng: business.lng }}
                  zoom={15}
                  heightClass="h-[320px]"
                  selectedBusinessId={business.id}
                  mapsConfigured={mapsConfigured}
                />
              </div>
            </section>

            {/* Ratings & Reviews */}
            <section className="border-t border-slate-200/80 pt-8">
              <h2 className="font-display text-xl font-bold text-[#0b1220] mb-4">
                Customer Reviews ({reviews.length})
              </h2>

              {profile?.role === 'customer' && (
                <form
                  onSubmit={handleSubmitReview}
                  className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#0b1220]">Share Your Experience</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="p-1 cursor-pointer"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              star <= reviewRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Tell neighbors what stood out during your visit..."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                  {reviewMessage && (
                    <p className="text-xs font-medium text-blue-700">{reviewMessage}</p>
                  )}
                  <button
                    type="submit"
                    disabled={reviewSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0b1220] hover:bg-slate-800 rounded-xl disabled:opacity-60 cursor-pointer"
                  >
                    {reviewSubmitting ? 'Publishing...' : 'Publish Review'}
                  </button>
                </form>
              )}

              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No reviews yet. Be the first customer to review {business.name}.
                </p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-[#0b1220]">
                          {rev.customerName}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-800 tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {rev.rating}.0
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{rev.comment}</p>
                      {rev.ownerReply && (
                        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                          <span className="font-semibold text-[#0b1220]">Owner response: </span>
                          {rev.ownerReply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Sticky Airbnb-Inspired Appointment Panel */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24">
            <div className="border border-slate-200/90 rounded-3xl p-6 bg-white shadow-lg shadow-slate-900/[0.04]">
              <h2 className="font-display text-xl font-bold text-[#0b1220]">
                Request an Appointment
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Real-time slot reservation with instant confirmation tracking.
              </p>

              {bookingSuccessId ? (
                <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    Appointment Request Sent
                  </div>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    Your booking request (ID: <span className="font-mono">{bookingSuccessId}</span>)
                    has been sent to {business.name}. You will be notified as soon as the owner
                    responds.
                  </p>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate({ name: 'customer-dashboard', tab: 'appointments' })}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer"
                    >
                      View My Appointments
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingSuccessId(null)}
                      className="px-4 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-xl cursor-pointer"
                    >
                      Book Another
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleBookAppointment} className="mt-6 space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      1. Select Service
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
                    >
                      {services.length === 0 ? (
                        <option value="">No services available</option>
                      ) : (
                        services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.durationMinutes} min
                            {s.price > 0 ? ` · Fee ${formatServiceFee(s.price)}` : ''})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      2. Choose Date
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="date"
                        required
                        min={new Date().toISOString().split('T')[0]}
                        value={bookingDate}
                        onChange={(e) => {
                          setBookingDate(e.target.value);
                          setSelectedTimeSlot('');
                        }}
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        3. Select Available Time Slot
                      </label>
                      {slotsLoading && (
                        <span className="text-[11px] text-slate-400">Checking slots...</span>
                      )}
                    </div>

                    {availableSlots.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                        Business is closed or no remaining slots are available on this date.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                        {availableSlots.map((slot) => {
                          const isTaken = bookedSlots.includes(slot);
                          const isSelected = selectedTimeSlot === slot;
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={isTaken}
                              onClick={() => setSelectedTimeSlot(slot)}
                              className={`py-2 px-2 rounded-xl text-xs font-mono font-medium border transition-colors tabular-nums ${
                                isTaken
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-blue-600 text-white border-blue-600 cursor-pointer'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-blue-400 cursor-pointer'
                              }`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <label className="block text-xs font-semibold text-slate-700">
                      4. Your Contact Details
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full name"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="email"
                        required
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Phone number"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes or special requests..."
                      className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {bookingError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      {bookingError}
                    </div>
                  )}

                  {!profile ? (
                    <button
                      type="button"
                      onClick={() => onNavigate({ name: 'customer-auth', mode: 'login' })}
                      className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#0b1220] hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                    >
                      Sign In as Customer to Book
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={bookingSubmitting || services.length === 0}
                      className="w-full py-3 px-4 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {bookingSubmitting ? 'Confirming Slot...' : 'Request Appointment'}
                    </button>
                  )}
                </form>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-xl">
            <h3 className="font-display text-lg font-bold text-[#0b1220]">
              Contact {business.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Reach out directly to the business owner or location desk.
            </p>
            <div className="mt-5 space-y-3 text-sm">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <Phone className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <a
                    href={`tel:${business.businessPhone.replace(/[^0-9+\-().\s]/g, '')}`}
                    className="font-semibold text-[#0b1220]"
                  >
                    {business.businessPhone}
                  </a>
                </div>
              </div>
              {business.publicEmail && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <a
                      href={`mailto:${business.publicEmail.replace(/[^a-zA-Z0-9._%+\-@]/g, '')}`}
                      className="font-semibold text-[#0b1220]"
                    >
                      {business.publicEmail}
                    </a>
                  </div>
                </div>
              )}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Address</p>
                  <p className="font-medium text-[#0b1220]">
                    {business.address}, {business.city} {business.postalCode}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-2.5">
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 text-center text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Get Directions
              </a>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#0b1220] hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <img
            src={lightboxImg}
            alt="Business gallery preview"
            referrerPolicy="no-referrer"
            className="max-w-4xl max-h-[85vh] rounded-3xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
