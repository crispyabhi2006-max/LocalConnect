import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  ImagePlus,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  checkDuplicateBusiness,
  createBusiness,
  createService,
  fetchOwnerBusiness,
  formatReadableFirestoreError,
} from '../lib/db';
import { formatTierLabel } from '../lib/format';
import { uploadBusinessImage } from '../lib/firebase';
import { useAutocompleteSuggestions } from '../lib/maps';
import {
  BUSINESS_CATEGORIES,
  CATEGORY_FALLBACK_IMAGES,
  DAY_LABELS,
  DEFAULT_OPENING_HOURS,
  type BusinessCategory,
  type DayKey,
  type OpeningHours,
  type PriceRange,
} from '../types';
import { GoogleMapsView } from '../components/GoogleMapsView';
import type { AppRoute } from '../components/Navbar';

interface OwnerAuthPageProps {
  initialMode?: 'login' | 'register';
  onNavigate: (route: AppRoute) => void;
  onBusinessCreated: () => void;
  mapsConfigured: boolean;
}

interface DraftService {
  name: string;
  price: string;
  durationMinutes: string;
  description: string;
}

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const PRICE_TIERS: PriceRange[] = ['$', '$$', '$$$', '$$$$'];

export function OwnerAuthPage({
  initialMode = 'login',
  onNavigate,
  onBusinessCreated,
  mapsConfigured,
}: OwnerAuthPageProps) {
  const {
    profile,
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    authError,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Owner Registration fields
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  // Business Details fields
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState<BusinessCategory>('Restaurants');
  const [priceRange, setPriceRange] = useState<PriceRange>('$$');
  const [description, setDescription] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [publicEmail, setPublicEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [lat, setLat] = useState<number>(37.7749);
  const [lng, setLng] = useState<number>(-122.4194);
  const [placeId, setPlaceId] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  // Google Places Autocomplete
  const [addressSearch, setAddressSearch] = useState('');
  const { suggestions, resetSession } = useAutocompleteSuggestions(addressSearch);

  // Images & local object URL previews
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [logoPreview, setLogoPreview] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  // Hours & Booking Policy
  const [openingHours, setOpeningHours] = useState<OpeningHours>(DEFAULT_OPENING_HOURS);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState<number>(30);
  const [cancellationPolicyHours, setCancellationPolicyHours] = useState<number>(24);

  // Initial Services
  const [services, setServices] = useState<DraftService[]>([
    { name: '', price: '45', durationMinutes: '45', description: '' },
  ]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview('');
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  useEffect(() => {
    if (galleryFiles.length === 0) {
      setGalleryPreviews([]);
      return;
    }
    const urls = galleryFiles.map((f) => URL.createObjectURL(f));
    setGalleryPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [galleryFiles]);

  useEffect(() => {
    if (profile?.role === 'owner') {
      setOwnerName((prev) => prev || profile.name);
      setOwnerEmail((prev) => prev || profile.email);
      setOwnerPhone((prev) => prev || profile.phone);
      void fetchOwnerBusiness(profile.uid).then((biz) => {
        if (biz) {
          onNavigate({ name: 'owner-dashboard', tab: 'dashboard' });
        }
      });
    }
  }, [profile, onNavigate]);

  const handleSelectPrediction = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'id'],
      });
      if (place.location) {
        setLat(place.location.lat());
        setLng(place.location.lng());
      }
      if (place.formattedAddress) {
        setAddress(place.formattedAddress);
        setAddressSearch(place.formattedAddress);
      }
      if (place.id) setPlaceId(place.id);
      if (place.addressComponents) {
        const locality = place.addressComponents.find((c) => c.types.includes('locality'));
        const postal = place.addressComponents.find((c) => c.types.includes('postal_code'));
        if (locality?.longText) setCity(locality.longText);
        if (postal?.longText) setPostalCode(postal.longText);
      }
      resetSession();
    } catch (err) {
      console.error('Place fetchFields error:', err);
    }
  };

  const handleGeocodeAddress = async () => {
    if (!address.trim() && !city.trim()) {
      setError('Enter an address or city before locating coordinates.');
      return;
    }
    setGeocoding(true);
    setError(null);
    try {
      const res = await fetch('/api/maps/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, city, postalCode }),
      });
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      const data = (await res.json()) as {
        lat?: number;
        lng?: number;
        formattedAddress?: string;
        placeId?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Could not locate address automatically.');
      }
      if (typeof data.lat === 'number' && typeof data.lng === 'number') {
        setLat(data.lat);
        setLng(data.lng);
      }
      if (data.placeId) setPlaceId(data.placeId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Geocoding failed. Click on the map to place the pin.'
      );
    } finally {
      setGeocoding(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithEmail({ email: loginEmail, password: loginPassword, expectedRole: 'owner' });
      onNavigate({ name: 'owner-dashboard', tab: 'dashboard' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleOwnerAuth = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await loginWithGoogle('owner', true);
      const existingBiz = await fetchOwnerBusiness(loggedIn.uid);
      if (existingBiz) {
        onNavigate({ name: 'owner-dashboard', tab: 'dashboard' });
      } else {
        setMode('register');
        setOwnerName(loggedIn.name);
        setOwnerEmail(loggedIn.email);
        setOwnerPhone(loggedIn.phone);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (businessName.trim().length < 2) {
      setError('Business name must be at least 2 characters.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Business description must be at least 10 characters.');
      return;
    }
    const effectivePhone = (businessPhone.trim() || ownerPhone.trim()).trim();
    if (effectivePhone.length < 5) {
      setError('Business contact phone number must be at least 5 characters.');
      return;
    }
    if (address.trim().length < 3 || city.trim().length < 2 || postalCode.trim().length < 2) {
      setError(
        'Full business address (min 3 chars), city (min 2 chars), and postal code (min 2 chars) are required.'
      );
      return;
    }
    const validServices = services.filter((s) => s.name.trim().length >= 2);
    if (validServices.length === 0) {
      setError('Please add at least one service with a name and duration.');
      return;
    }

    setSubmitting(true);
    try {
      const isDuplicate = await checkDuplicateBusiness(businessName, city);
      if (isDuplicate) {
        throw new Error(
          `A business named "${businessName.trim()}" is already registered in ${city.trim()}.`
        );
      }

      let ownerUid = profile?.role === 'owner' ? profile.uid : '';
      if (!ownerUid) {
        if (profile && profile.role !== 'owner') {
          throw new Error(
            'You are signed in as a Customer. Please sign out first to register a Business Owner account.'
          );
        }
        const createdProfile = await registerWithEmail({
          name: ownerName,
          email: ownerEmail,
          password: ownerPassword,
          phone: ownerPhone,
          city,
          role: 'owner',
        });
        ownerUid = createdProfile.uid;
      }

      let finalLogo = logoUrl.trim();
      let finalCover = coverUrl.trim();
      const finalGallery = [...galleryUrls];

      if (logoFile) {
        finalLogo = await uploadBusinessImage(logoFile, 'logos', ownerUid);
      }
      if (coverFile) {
        finalCover = await uploadBusinessImage(coverFile, 'covers', ownerUid);
      }
      for (const file of galleryFiles.slice(0, 6)) {
        const uploadedUrl = await uploadBusinessImage(file, 'gallery', ownerUid);
        finalGallery.push(uploadedUrl);
      }

      if (!finalCover) {
        finalCover = CATEGORY_FALLBACK_IMAGES[category];
      }

      const businessId = await createBusiness({
        ownerId: ownerUid,
        ownerName: ownerName.trim() || profile?.name || 'Business Owner',
        name: businessName.trim(),
        category,
        description: description.trim(),
        address: address.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        lat,
        lng,
        placeId,
        businessPhone: businessPhone.trim() || ownerPhone.trim(),
        publicEmail: publicEmail.trim() || ownerEmail.trim(),
        logoUrl: finalLogo,
        coverUrl: finalCover,
        galleryUrls: finalGallery,
        openingHours,
        slotDurationMinutes,
        cancellationPolicyHours,
        priceRange,
        isFeatured: true,
        isActive: true,
      });

      for (const svc of validServices) {
        await createService({
          businessId,
          ownerId: ownerUid,
          name: svc.name.trim(),
          description: svc.description.trim(),
          price: Number(svc.price) || 0,
          durationMinutes: Number(svc.durationMinutes) || 30,
          category,
          isActive: true,
        });
      }

      onBusinessCreated();
      onNavigate({ name: 'owner-dashboard', tab: 'dashboard' });
    } catch (err) {
      setError(formatReadableFirestoreError(err, 'Business registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = error || authError;
  const resolvedLogoPreview = logoPreview || logoUrl.trim();
  const resolvedCoverPreview = coverPreview || coverUrl.trim();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-indigo-600">Business Owner Studio</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#0b1220] mt-1">
              {mode === 'login'
                ? 'Sign in to your Business Studio'
                : 'Register Your Local Business'}
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                clearAuthError();
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'login' ? 'bg-white text-[#0b1220] shadow-xs' : 'text-slate-600'
              }`}
            >
              Owner Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                clearAuthError();
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'register' ? 'bg-white text-[#0b1220] shadow-xs' : 'text-slate-600'
              }`}
            >
              Register Business
            </button>
          </div>
        </div>

        {mode === 'login' ? (
          <div className="max-w-md mx-auto bg-white border border-slate-200/90 rounded-3xl p-8 shadow-sm">
            <button
              type="button"
              onClick={handleGoogleOwnerAuth}
              disabled={submitting}
              className="w-full py-2.5 px-4 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-800 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              Continue with Google (Owner)
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or with email</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Owner Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="owner@business.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {displayedError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {displayedError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Signing In...' : 'Sign In to Owner Studio'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-600">
              Looking to discover businesses?{' '}
              <button
                type="button"
                onClick={() => onNavigate({ name: 'customer-auth', mode: 'login' })}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Switch to Customer Sign In
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegisterBusiness} className="space-y-6">
            {/* Section 1: Owner Account */}
            <section className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <User className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-display text-lg font-bold text-[#0b1220]">
                    01. Business Owner Account
                  </h2>
                </div>
                {!profile && (
                  <button
                    type="button"
                    onClick={handleGoogleOwnerAuth}
                    className="px-4 py-2 text-xs font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer"
                  >
                    Use Google Account instead
                  </button>
                )}
              </div>

              {profile?.role === 'owner' ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Signed in as <strong>{profile.name}</strong> ({profile.email}). Complete your
                    business profile below.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Owner Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Jordan Taylor"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Owner Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="owner@studio.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Owner Phone *
                    </label>
                    <input
                      type="tel"
                      required
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="+1 555 0199"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Section 2: Business Information */}
            <section className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h2 className="font-display text-lg font-bold text-[#0b1220]">
                  02. Business Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Aurora Hair & Wellness"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500"
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
                      Experience Tier
                    </label>
                    <select
                      value={priceRange}
                      onChange={(e) => setPriceRange(e.target.value as PriceRange)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500"
                    >
                      {PRICE_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {formatTierLabel(tier)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Business Contact Phone *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={businessPhone}
                      onChange={(e) => setBusinessPhone(e.target.value)}
                      placeholder="+1 555 0140"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Public Business Email
                  </label>
                  <input
                    type="email"
                    value={publicEmail}
                    onChange={(e) => setPublicEmail(e.target.value)}
                    placeholder="hello@business.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Business Description *
                  </label>
                  <textarea
                    rows={3}
                    required
                    minLength={10}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your specialties, experience, and what customers can expect..."
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Location & Google Maps Picker */}
            <section className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                <MapPin className="w-5 h-5 text-indigo-600" />
                <h2 className="font-display text-lg font-bold text-[#0b1220]">
                  03. Address & Map Location
                </h2>
              </div>

              {mapsConfigured && (
                <div className="relative">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Search Address with Google Places
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={addressSearch}
                      onChange={(e) => setAddressSearch(e.target.value)}
                      placeholder="Start typing street address to autocomplete..."
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  {suggestions.length > 0 && (
                    <ul className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {suggestions.map((s, idx) => (
                        <li
                          key={idx}
                          onClick={() => void handleSelectPrediction(s)}
                          className="px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50 cursor-pointer"
                        >
                          {s.placePrediction?.text.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="742 Evergreen Terrace"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="San Francisco"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Postal Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="94107"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Pin Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)} (click map to fine-tune)
                </p>
                <button
                  type="button"
                  onClick={handleGeocodeAddress}
                  disabled={geocoding}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {geocoding ? 'Locating...' : 'Locate Address on Map'}
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-slate-200">
                <GoogleMapsView
                  center={{ lat, lng }}
                  zoom={14}
                  heightClass="h-[280px]"
                  interactivePicker
                  pickedLocation={{ lat, lng }}
                  onPickLocation={(coords) => {
                    setLat(coords.lat);
                    setLng(coords.lng);
                  }}
                  mapsConfigured={mapsConfigured}
                />
              </div>
            </section>

            {/* Section 4: Business Images with Live Previews */}
            <section className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                <ImagePlus className="w-5 h-5 text-indigo-600" />
                <h2 className="font-display text-lg font-bold text-[#0b1220]">
                  04. Business Imagery & Live Previews
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Business Logo (Upload or URL)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                      {resolvedLogoPreview ? (
                        <img
                          src={resolvedLogoPreview}
                          alt="Logo preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building2 className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
                    />
                  </div>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="Or paste logo image URL"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Cover Photo (Upload or URL)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-16 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0">
                      <img
                        src={resolvedCoverPreview || CATEGORY_FALLBACK_IMAGES[category]}
                        alt="Cover preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
                    />
                  </div>
                  <input
                    type="url"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="Or paste cover photo URL (defaults to category photo)"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Gallery Photos (up to 6)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setGalleryFiles(Array.from(e.target.files || []).slice(0, 6))}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
                  />
                  {galleryPreviews.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                      {galleryPreviews.map((src, idx) => (
                        <div
                          key={`${src}-${idx}`}
                          className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
                        >
                          <img src={src} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  {galleryUrls.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{galleryUrls.length} URLs added</p>
                  )}
                </div>
              </div>
            </section>

            {/* Section 5: Services & Opening Hours */}
            <section className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-display text-lg font-bold text-[#0b1220]">
                    05. Services & Opening Hours
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setServices((prev) => [
                      ...prev,
                      { name: '', price: '50', durationMinutes: '30', description: '' },
                    ])
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Service
                </button>
              </div>

              <div className="space-y-3">
                {services.map((svc, idx) => (
                  <div
                    key={idx}
                    className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start"
                  >
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        required
                        value={svc.name}
                        onChange={(e) => {
                          const next = [...services];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setServices(next);
                        }}
                        placeholder="Service name (e.g. Signature Cut)"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={svc.price}
                        onChange={(e) => {
                          const next = [...services];
                          next[idx] = { ...next[idx], price: e.target.value };
                          setServices(next);
                        }}
                        placeholder="Service fee"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min="5"
                        step="5"
                        required
                        value={svc.durationMinutes}
                        onChange={(e) => {
                          const next = [...services];
                          next[idx] = { ...next[idx], durationMinutes: e.target.value };
                          setServices(next);
                        }}
                        placeholder="Mins"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        value={svc.description}
                        onChange={(e) => {
                          const next = [...services];
                          next[idx] = { ...next[idx], description: e.target.value };
                          setServices(next);
                        }}
                        placeholder="Short description"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      {services.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setServices((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Appointment Slot Interval (minutes)
                  </label>
                  <select
                    value={slotDurationMinutes}
                    onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
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
                    Customer Cancellation Notice Policy (hours)
                  </label>
                  <select
                    value={cancellationPolicyHours}
                    onChange={(e) => setCancellationPolicyHours(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                  >
                    <option value={0}>Flexible (anytime)</option>
                    <option value={2}>2 hours before</option>
                    <option value={12}>12 hours before</option>
                    <option value={24}>24 hours before</option>
                    <option value={48}>48 hours before</option>
                  </select>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                {DAY_ORDER.map((day) => {
                  const h = openingHours[day];
                  return (
                    <div
                      key={day}
                      className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm bg-white"
                    >
                      <span className="font-medium text-slate-800 w-28">{DAY_LABELS[day]}</span>
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={h.closed}
                          onChange={(e) =>
                            setOpeningHours((prev) => ({
                              ...prev,
                              [day]: { ...prev[day], closed: e.target.checked },
                            }))
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
                              setOpeningHours((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], open: e.target.value },
                              }))
                            }
                            className="px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="time"
                            value={h.close}
                            onChange={(e) =>
                              setOpeningHours((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], close: e.target.value },
                              }))
                            }
                            className="px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {displayedError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                {displayedError}
              </div>
            )}

            <div className="flex items-center justify-end gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-sm transition-all disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Publishing Business...'
                  : 'Complete Registration & Launch Studio'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
