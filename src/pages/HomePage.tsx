import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Car,
  Compass,
  Dumbbell,
  HeartPulse,
  MapPin,
  Search,
  Scissors,
  ShoppingBag,
  Store,
  Tag,
  Utensils,
  Wrench,
} from 'lucide-react';
import {
  BUSINESS_CATEGORIES,
  CATEGORY_FALLBACK_IMAGES,
  type Business,
  type BusinessCategory,
} from '../types';
import { BusinessCard } from '../components/BusinessCard';
import { GoogleMapsView } from '../components/GoogleMapsView';
import { haversineDistanceKm } from '../lib/maps';
import type { AppRoute } from '../components/Navbar';

interface HomePageProps {
  businesses: Business[];
  loading: boolean;
  userCoords: { lat: number; lng: number } | null;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  onDetectLocation: () => void;
  detectingLocation: boolean;
  favouriteIds: Set<string>;
  onToggleFavourite: (business: Business) => void;
  onNavigate: (route: AppRoute) => void;
  mapsConfigured: boolean;
}

const CATEGORY_ICONS: Record<BusinessCategory, React.ComponentType<{ className?: string }>> = {
  Restaurants: Utensils,
  'Hospitals and Clinics': HeartPulse,
  'Beauty Salons': Scissors,
  'Shopping Stores': ShoppingBag,
  'Educational Institutions': BookOpen,
  'Automobile Services': Car,
  'Home Services': Wrench,
  'Fitness Centres': Dumbbell,
  'Other Local Businesses': Store,
};

export function HomePage({
  businesses,
  loading,
  userCoords,
  selectedCity,
  onSelectCity,
  onDetectLocation,
  detectingLocation,
  favouriteIds,
  onToggleFavourite,
  onNavigate,
  mapsConfigured,
}: HomePageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [heroCategory, setHeroCategory] = useState('');
  const [selectedMapBiz, setSelectedMapBiz] = useState<Business | null>(null);

  const availableCities = useMemo(() => {
    const cities = Array.from(new Set(businesses.map((b) => b.city).filter(Boolean)));
    return cities.sort();
  }, [businesses]);

  const cityFiltered = useMemo(() => {
    if (!selectedCity) return businesses;
    return businesses.filter((b) => b.city.toLowerCase() === selectedCity.toLowerCase());
  }, [businesses, selectedCity]);

  const nearbyBusinesses = useMemo(() => {
    const list = [...cityFiltered];
    if (userCoords) {
      list.sort(
        (a, b) =>
          haversineDistanceKm(userCoords.lat, userCoords.lng, a.lat, a.lng) -
          haversineDistanceKm(userCoords.lat, userCoords.lng, b.lat, b.lng)
      );
    }
    return list.slice(0, 4);
  }, [cityFiltered, userCoords]);

  const featuredBusinesses = useMemo(
    () => cityFiltered.filter((b) => b.isFeatured).slice(0, 4),
    [cityFiltered]
  );

  const recentBusinesses = useMemo(() => {
    return [...cityFiltered]
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      })
      .slice(0, 4);
  }, [cityFiltered]);

  const topRatedBusinesses = useMemo(() => {
    return [...cityFiltered]
      .sort((a, b) => b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount)
      .slice(0, 4);
  }, [cityFiltered]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of BUSINESS_CATEGORIES) counts[cat] = 0;
    for (const b of businesses) {
      counts[b.category] = (counts[b.category] || 0) + 1;
    }
    return counts;
  }, [businesses]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate({
      name: 'search',
      query: searchTerm.trim(),
      category: heroCategory || undefined,
      city: selectedCity || undefined,
    });
  };

  const mapCenter = useMemo(() => {
    if (selectedMapBiz) return { lat: selectedMapBiz.lat, lng: selectedMapBiz.lng };
    if (userCoords) return userCoords;
    if (cityFiltered.length > 0) return { lat: cityFiltered[0].lat, lng: cityFiltered[0].lng };
    return { lat: 37.7749, lng: -122.4194 };
  }, [selectedMapBiz, userCoords, cityFiltered]);

  return (
    <div className="bg-white">
      {/* Airbnb-Inspired Hero Section */}
      <section className="relative border-b border-slate-200/80 bg-gradient-to-b from-slate-50/90 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <p className="text-xs font-semibold text-blue-600 tracking-wide mb-3">
                Curated Local Directory · Instant Scheduling
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight text-[#0b1220] leading-[1.08] text-balance">
                Discover Great Businesses Near You
              </h1>
              <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                Explore trusted neighborhood restaurants, clinics, salons, studios, and home
                specialists. View verified profiles, browse available services, and reserve real-time
                appointments.
              </p>

              {/* Multi-Field Airbnb-Style Search Bar */}
              <form
                onSubmit={handleSearchSubmit}
                className="mt-8 bg-white border border-slate-200/90 rounded-2xl p-2 shadow-lg shadow-slate-900/[0.04] grid grid-cols-1 md:grid-cols-12 gap-1.5 items-center"
              >
                {/* Business / Keyword Search */}
                <div className="md:col-span-5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl hover:bg-slate-50/80 transition-colors">
                  <Search className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 leading-none mb-1">
                      What are you looking for?
                    </label>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Business name or service..."
                      className="w-full text-sm font-medium text-[#0b1220] placeholder:text-slate-400 bg-transparent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Category Select */}
                <div className="md:col-span-3 flex items-center gap-2 px-3.5 py-2.5 md:border-l border-t md:border-t-0 border-slate-200/80 rounded-xl md:rounded-none hover:bg-slate-50/80 transition-colors">
                  <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 leading-none mb-1">
                      Category
                    </label>
                    <select
                      aria-label="Select business category"
                      value={heroCategory}
                      onChange={(e) => setHeroCategory(e.target.value)}
                      className="w-full text-sm font-medium text-[#0b1220] bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="">All Categories</option>
                      {BUSINESS_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Location Select + Detect */}
                <div className="md:col-span-4 flex items-center justify-between gap-2 pl-3.5 pr-1.5 py-1.5 md:border-l border-t md:border-t-0 border-slate-200/80">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <label className="block text-[11px] font-semibold text-slate-500 leading-none mb-1">
                        Location
                      </label>
                      <div className="flex items-center gap-1">
                        <select
                          aria-label="Select city"
                          value={selectedCity}
                          onChange={(e) => onSelectCity(e.target.value)}
                          className="w-full text-sm font-medium text-[#0b1220] bg-transparent focus:outline-none cursor-pointer truncate"
                        >
                          <option value="">All Locations</option>
                          {availableCities.map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={onDetectLocation}
                          title="Use my current location"
                          disabled={detectingLocation}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded-md transition-colors shrink-0 cursor-pointer"
                        >
                          <Compass className={`w-4 h-4 ${detectingLocation ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                <span className="tabular-nums font-medium text-slate-700">
                  {businesses.length} verified local storefronts
                </span>
                <span aria-hidden="true">·</span>
                <span>Live appointment availability</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'owner-auth', mode: 'register' })}
                  className="text-indigo-600 font-semibold hover:text-indigo-700 hover:underline cursor-pointer"
                >
                  List your business
                </button>
              </div>
            </div>

            {/* Hero Editorial Visual Anchor */}
            <div className="lg:col-span-5">
              <div className="relative h-full min-h-[300px] lg:min-h-[360px] rounded-3xl overflow-hidden border border-slate-200/80 bg-slate-100 shadow-sm">
                <img
                  src="/src/assets/images/hero_local_discovery_1795540190905.jpg"
                  alt="Vibrant local neighborhood storefronts and artisan shops"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/15 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <p className="text-xs font-medium text-blue-200">Neighborhood Highlights</p>
                  <p className="font-display font-bold text-lg mt-0.5 leading-snug">
                    Book directly with local owners across dining, wellness, retail, and care.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Category Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1220]">
              Popular Categories
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Browse verified local providers curated across essential neighborhood categories.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'search' })}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-indigo-600 whitespace-nowrap shrink-0 cursor-pointer"
          >
            View full directory
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {BUSINESS_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category];
            const count = categoryCounts[category] || 0;
            return (
              <button
                key={category}
                type="button"
                onClick={() => onNavigate({ name: 'search', category })}
                className="group text-left bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col"
              >
                <div className="h-24 w-full bg-slate-100 overflow-hidden relative">
                  <img
                    src={CATEGORY_FALLBACK_IMAGES[category]}
                    alt={category}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/15 to-transparent" />
                  <div className="absolute bottom-2.5 left-3 w-8 h-8 rounded-lg bg-white/95 backdrop-blur-sm flex items-center justify-center text-[#0b1220] group-hover:text-blue-600 transition-colors shadow-sm">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="p-3.5">
                  <p className="font-display font-semibold text-sm text-[#0b1220] leading-snug group-hover:text-blue-600 transition-colors">
                    {category}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {count} {count === 1 ? 'listing' : 'listings'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Loading / Empty / Live Discovery Listings */}
      {loading ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="border border-slate-200 rounded-2xl overflow-hidden bg-white animate-pulse"
              >
                <div className="aspect-[4/3] bg-slate-100" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : businesses.length === 0 ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="border border-slate-200 rounded-3xl bg-slate-50 p-10 text-center max-w-3xl mx-auto">
            <Store className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <h3 className="font-display text-xl font-bold text-[#0b1220]">
              No businesses registered yet
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              LocalConnect displays real registered storefronts from Cloud Firestore. Register a
              Business Owner account to publish the first local business and start accepting
              appointments.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate({ name: 'owner-auth', mode: 'register' })}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
              >
                Register Your Business
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ name: 'customer-auth', mode: 'register' })}
                className="px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Create Customer Account
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Featured Businesses */}
          {featuredBusinesses.length > 0 && (
            <section className="bg-slate-50/70 border-y border-slate-200/80 py-14">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
                  <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1220]">
                      Featured Businesses
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Standout local storefronts with active calendars and verified profiles.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate({ name: 'search', city: selectedCity || undefined })}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-indigo-600 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    See all featured
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {featuredBusinesses.map((biz) => (
                    <BusinessCard
                      key={biz.id}
                      business={biz}
                      isFavourite={favouriteIds.has(biz.id)}
                      onToggleFavourite={onToggleFavourite}
                      onSelect={(id) => onNavigate({ name: 'business', businessId: id })}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Recently Added Businesses */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1220]">
                  Recently Added Businesses
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Newly launched neighborhood businesses ready to welcome bookings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate({ name: 'search', city: selectedCity || undefined })}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-indigo-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Explore newest
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recentBusinesses.map((biz) => (
                <BusinessCard
                  key={biz.id}
                  business={biz}
                  isFavourite={favouriteIds.has(biz.id)}
                  onToggleFavourite={onToggleFavourite}
                  onSelect={(id) => onNavigate({ name: 'business', businessId: id })}
                />
              ))}
            </div>
          </section>

          {/* Nearby & Highly Rated */}
          <section className="bg-slate-50/70 border-t border-slate-200/80 py-14">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
                  <div>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-[#0b1220]">
                      Nearby Businesses
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {userCoords
                        ? 'Sorted closest to your detected coordinates.'
                        : selectedCity
                        ? `Active businesses located in ${selectedCity}.`
                        : 'Local businesses open for discovery and appointment requests.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate({ name: 'search', city: selectedCity || undefined })}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-indigo-600 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Explore nearby
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {nearbyBusinesses.map((biz) => (
                    <BusinessCard
                      key={biz.id}
                      business={biz}
                      distanceKm={
                        userCoords
                          ? haversineDistanceKm(userCoords.lat, userCoords.lng, biz.lat, biz.lng)
                          : null
                      }
                      isFavourite={favouriteIds.has(biz.id)}
                      onToggleFavourite={onToggleFavourite}
                      onSelect={(id) => onNavigate({ name: 'business', businessId: id })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
                  <div>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-[#0b1220]">
                      Highly Rated by Customers
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Top-reviewed local professionals across the community.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {topRatedBusinesses.map((biz) => (
                    <BusinessCard
                      key={biz.id}
                      business={biz}
                      isFavourite={favouriteIds.has(biz.id)}
                      onToggleFavourite={onToggleFavourite}
                      onSelect={(id) => onNavigate({ name: 'business', businessId: id })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Interactive Map Section */}
          <section className="border-t border-slate-200/80 bg-white py-14">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-[#0b1220]">
                    Explore Around You on the Map
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Select any pin to preview the business card and open its storefront.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'search' })}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-indigo-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open full map search
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
                <GoogleMapsView
                  businesses={cityFiltered}
                  center={mapCenter}
                  zoom={12}
                  heightClass="h-[420px]"
                  selectedBusinessId={selectedMapBiz?.id || null}
                  onSelectBusiness={setSelectedMapBiz}
                  onNavigateBusiness={(id) => onNavigate({ name: 'business', businessId: id })}
                  mapsConfigured={mapsConfigured}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
