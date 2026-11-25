import { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, type AppRoute } from './components/Navbar';
import {
  subscribeActiveBusinesses,
  subscribeCustomerFavourites,
  subscribeUserNotifications,
  toggleFavouriteBusiness,
} from './lib/db';
import { subscribeForegroundMessages } from './lib/firebase';
import type { AppNotification, Business, Favourite } from './types';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { BusinessDetailsPage } from './pages/BusinessDetailsPage';
import { CustomerAuthPage } from './pages/CustomerAuthPage';
import { OwnerAuthPage } from './pages/OwnerAuthPage';
import { CustomerDashboard } from './pages/CustomerDashboard';
import { OwnerDashboard } from './pages/OwnerDashboard';

function LocalConnectShell({ mapsApiKey }: { mapsApiKey: string }) {
  const { profile } = useAuth();
  const [route, setRoute] = useState<AppRoute>({ name: 'home' });
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessesLoading, setBusinessesLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [pushBanner, setPushBanner] = useState<{ title: string; body: string } | null>(null);

  const loadBusinesses = useCallback(() => {
    // Live onSnapshot handles automatic synchronization across clients
  }, []);

  useEffect(() => {
    setBusinessesLoading(true);
    const unsub = subscribeActiveBusinesses(
      (list) => {
        setBusinesses(list);
        setBusinessesLoading(false);
      },
      () => {
        setBusinessesLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (!profile) {
      setFavourites([]);
      setNotifications([]);
      return;
    }

    const unsubNotifs = subscribeUserNotifications(profile.uid, setNotifications);
    const unsubFavs =
      profile.role === 'customer'
        ? subscribeCustomerFavourites(profile.uid, setFavourites)
        : () => {};

    let unsubPush: (() => void) | null = null;
    void subscribeForegroundMessages((payload) => {
      setPushBanner(payload);
    }).then((unsub) => {
      unsubPush = unsub;
    });

    return () => {
      unsubNotifs();
      unsubFavs();
      unsubPush?.();
    };
  }, [profile]);

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleDetectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setDetectingLocation(false);
      },
      () => {
        setDetectingLocation(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);

  const favouriteIds = useMemo(
    () => new Set(favourites.map((f) => f.businessId)),
    [favourites]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const handleToggleFavourite = useCallback(
    async (business: Business) => {
      if (!profile) {
        navigate({ name: 'customer-auth', mode: 'login' });
        return;
      }
      if (profile.role !== 'customer') return;
      await toggleFavouriteBusiness(profile.uid, business, favouriteIds.has(business.id));
    },
    [profile, favouriteIds, navigate]
  );

  const mapsConfigured = Boolean(mapsApiKey);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {pushBanner && (
        <div className="bg-blue-600 text-white px-4 py-2.5 text-xs md:text-sm flex items-center justify-between gap-4 sticky top-0 z-50 shadow-sm">
          <span>
            <strong className="font-semibold">{pushBanner.title}:</strong> {pushBanner.body}
          </span>
          <button
            type="button"
            onClick={() => setPushBanner(null)}
            className="text-xs font-semibold underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <Navbar
        currentRoute={route}
        onNavigate={navigate}
        unreadNotifications={unreadNotifications}
      />

      <div className="flex-1">
        {route.name === 'home' && (
          <HomePage
            businesses={businesses}
            loading={businessesLoading}
            userCoords={userCoords}
            selectedCity={selectedCity}
            onSelectCity={setSelectedCity}
            onDetectLocation={handleDetectLocation}
            detectingLocation={detectingLocation}
            favouriteIds={favouriteIds}
            onToggleFavourite={handleToggleFavourite}
            onNavigate={navigate}
            mapsConfigured={mapsConfigured}
          />
        )}

        {route.name === 'search' && (
          <SearchPage
            businesses={businesses}
            loading={businessesLoading}
            initialQuery={route.query}
            initialCategory={route.category}
            initialCity={route.city}
            userCoords={userCoords}
            favouriteIds={favouriteIds}
            onToggleFavourite={handleToggleFavourite}
            onNavigate={navigate}
            mapsConfigured={mapsConfigured}
          />
        )}

        {route.name === 'business' && (
          <BusinessDetailsPage
            businessId={route.businessId}
            favouriteIds={favouriteIds}
            onToggleFavourite={handleToggleFavourite}
            onNavigate={navigate}
            mapsConfigured={mapsConfigured}
          />
        )}

        {route.name === 'customer-auth' && (
          <CustomerAuthPage initialMode={route.mode} onNavigate={navigate} />
        )}

        {route.name === 'owner-auth' && (
          <OwnerAuthPage
            initialMode={route.mode}
            onNavigate={navigate}
            onBusinessCreated={() => void loadBusinesses()}
            mapsConfigured={mapsConfigured}
          />
        )}

        {route.name === 'customer-dashboard' && (
          <CustomerDashboard initialTab={route.tab} onNavigate={navigate} />
        )}

        {route.name === 'owner-dashboard' && (
          <OwnerDashboard
            initialTab={route.tab}
            onNavigate={navigate}
            onBusinessesChanged={() => void loadBusinesses()}
            mapsConfigured={mapsConfigured}
          />
        )}
      </div>

      <footer className="border-t border-slate-200 bg-slate-50/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-slate-200/80">
            <div className="md:col-span-5">
              <button
                type="button"
                onClick={() => navigate({ name: 'home' })}
                className="inline-flex items-center gap-2 font-display font-bold text-lg text-[#0b1220] cursor-pointer"
              >
                <span className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 1 1 13 0c0 5.2-6.5 11-6.5 11Z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="10" r="2.2" />
                  </svg>
                </span>
                <span>LocalConnect</span>
              </button>
              <p className="mt-3 text-sm text-slate-600 max-w-sm leading-relaxed">
                Neighborhood business discovery and real-time appointment scheduling connecting
                local specialists directly with customers.
              </p>
            </div>

            <div className="md:col-span-2 space-y-2.5 text-sm">
              <p className="font-display font-semibold text-[#0b1220]">Discover</p>
              <div className="flex flex-col items-start gap-2 text-slate-600">
                <button
                  type="button"
                  onClick={() => navigate({ name: 'home' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Featured Locales
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'search' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Browse Directory
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'search', category: 'Restaurants' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Restaurants
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'search', category: 'Beauty Salons' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Beauty Salons
                </button>
              </div>
            </div>

            <div className="md:col-span-2 space-y-2.5 text-sm">
              <p className="font-display font-semibold text-[#0b1220]">Customers</p>
              <div className="flex flex-col items-start gap-2 text-slate-600">
                <button
                  type="button"
                  onClick={() => navigate({ name: 'customer-auth', mode: 'login' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Customer Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'customer-auth', mode: 'register' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'customer-dashboard', tab: 'appointments' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  My Appointments
                </button>
              </div>
            </div>

            <div className="md:col-span-3 space-y-2.5 text-sm">
              <p className="font-display font-semibold text-[#0b1220]">Business Owners</p>
              <div className="flex flex-col items-start gap-2 text-slate-600">
                <button
                  type="button"
                  onClick={() => navigate({ name: 'owner-auth', mode: 'register' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Register Your Business
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'owner-auth', mode: 'login' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Owner Studio Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'owner-dashboard', tab: 'dashboard' })}
                  className="hover:text-[#0b1220] transition-colors cursor-pointer"
                >
                  Manage Storefront
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} LocalConnect. All rights reserved.</p>
            <p>Verified local listings · Real-time slot availability</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/config/maps-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { browserKey?: string } | null) => {
        if (data?.browserKey) {
          setMapsApiKey(data.browserKey);
        }
      })
      .catch(() => {
        // Ignore non-critical runtime config fetch error
      });
  }, [mapsApiKey]);

  const content = (
    <AuthProvider>
      <LocalConnectShell mapsApiKey={mapsApiKey} />
    </AuthProvider>
  );

  if (mapsApiKey) {
    return (
      <APIProvider
        apiKey={mapsApiKey}
        libraries={['places', 'marker']}
        language="en"
        region="US"
      >
        {content}
      </APIProvider>
    );
  }

  return content;
}
