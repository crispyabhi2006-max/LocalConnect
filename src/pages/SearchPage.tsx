import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { subscribeActiveServices } from '../lib/db';
import { formatTierLabel } from '../lib/format';
import { haversineDistanceKm } from '../lib/maps';
import {
  BUSINESS_CATEGORIES,
  type Business,
  type PriceRange,
  type ServiceItem,
} from '../types';
import { BusinessCard } from '../components/BusinessCard';
import { GoogleMapsView } from '../components/GoogleMapsView';
import type { AppRoute } from '../components/Navbar';

interface SearchPageProps {
  businesses: Business[];
  loading: boolean;
  initialQuery?: string;
  initialCategory?: string;
  initialCity?: string;
  userCoords: { lat: number; lng: number } | null;
  favouriteIds: Set<string>;
  onToggleFavourite: (business: Business) => void;
  onNavigate: (route: AppRoute) => void;
  mapsConfigured: boolean;
}

const TIER_FILTERS: Array<PriceRange | ''> = ['', '$', '$$', '$$$', '$$$$'];

export function SearchPage({
  businesses,
  loading,
  initialQuery = '',
  initialCategory = '',
  initialCity = '',
  userCoords,
  favouriteIds,
  onToggleFavourite,
  onNavigate,
  mapsConfigured,
}: SearchPageProps) {
  const [keyword, setKeyword] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [city, setCity] = useState(initialCity);
  const [minRating, setMinRating] = useState<number>(0);
  const [priceRange, setPriceRange] = useState<PriceRange | ''>('');
  const [selectedMapBiz, setSelectedMapBiz] = useState<Business | null>(null);
  const [servicesByBiz, setServicesByBiz] = useState<Record<string, ServiceItem[]>>({});

  useEffect(() => {
    setKeyword(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setCity(initialCity);
  }, [initialCity]);

  useEffect(() => {
    const unsub = subscribeActiveServices(
      (list) => {
        const grouped: Record<string, ServiceItem[]> = {};
        list.forEach((svc) => {
          if (!grouped[svc.businessId]) grouped[svc.businessId] = [];
          grouped[svc.businessId].push(svc);
        });
        setServicesByBiz(grouped);
      },
      (err) => {
        console.error('Unable to subscribe to services index for search:', err);
      }
    );
    return () => unsub();
  }, []);

  const cities = useMemo(
    () => Array.from(new Set(businesses.map((b) => b.city).filter(Boolean))).sort(),
    [businesses]
  );

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return businesses.filter((b) => {
      if (category && b.category !== category) return false;
      if (city && b.city.toLowerCase() !== city.toLowerCase()) return false;
      if (minRating > 0 && b.ratingAvg < minRating) return false;
      if (priceRange && b.priceRange !== priceRange) return false;

      if (q) {
        const bizServices = servicesByBiz[b.id] || [];
        const serviceMatches = bizServices.some(
          (s) =>
            s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        );
        const directMatch =
          b.name.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q);
        if (!directMatch && !serviceMatches) return false;
      }

      return true;
    });
  }, [businesses, keyword, category, city, minRating, priceRange, servicesByBiz]);

  const resetFilters = () => {
    setKeyword('');
    setCategory('');
    setCity('');
    setMinRating(0);
    setPriceRange('');
  };

  const mapCenter = useMemo(() => {
    if (selectedMapBiz) return { lat: selectedMapBiz.lat, lng: selectedMapBiz.lng };
    if (filtered.length > 0) return { lat: filtered[0].lat, lng: filtered[0].lng };
    if (userCoords) return userCoords;
    return { lat: 37.7749, lng: -122.4194 };
  }, [selectedMapBiz, filtered, userCoords]);

  return (
    <div className="bg-slate-50/40 min-h-[calc(100vh-4rem)]">
      <div className="bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0b1220]">
            Explore Local Businesses
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Search live storefronts by business name, service, category, city, or rating.
          </p>

          <div className="mt-6 bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Search business name, service, or keyword..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  aria-label="Filter by category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  {BUSINESS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  aria-label="Filter by location"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  aria-label="Filter by minimum rating"
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value={0}>Any Rating</option>
                  <option value={4.5}>4.5+ Stars</option>
                  <option value={4}>4.0+ Stars</option>
                  <option value={3}>3.0+ Stars</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/70">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mr-1">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Experience Tier:
                </span>
                {TIER_FILTERS.map((tier) => (
                  <button
                    key={tier || 'all'}
                    type="button"
                    onClick={() => setPriceRange(tier)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      priceRange === tier
                        ? 'bg-[#0b1220] text-white border-[#0b1220]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {tier ? formatTierLabel(tier) : 'All'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="tabular-nums font-semibold text-slate-700">
                  {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}
                </span>
                {(keyword || category || city || minRating > 0 || priceRange) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-blue-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Reset Filters
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results + Map Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-72 border border-slate-200 rounded-2xl bg-white animate-pulse"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="border border-slate-200 rounded-2xl bg-white p-10 text-center">
                <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <h2 className="font-display text-lg font-bold text-[#0b1220]">
                  No matching businesses found
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
                  Try adjusting your search keywords, category, location, or rating filters to
                  discover more local providers.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {filtered.map((biz) => (
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
            )}
          </div>

          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm">
              <GoogleMapsView
                businesses={filtered}
                center={mapCenter}
                zoom={12}
                heightClass="h-[540px]"
                selectedBusinessId={selectedMapBiz?.id || null}
                onSelectBusiness={setSelectedMapBiz}
                onNavigateBusiness={(id) => onNavigate({ name: 'business', businessId: id })}
                mapsConfigured={mapsConfigured}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
