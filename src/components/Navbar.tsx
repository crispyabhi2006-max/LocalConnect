import { useState } from 'react';
import { Bell, LogOut, Menu, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type AppRoute =
  | { name: 'home' }
  | { name: 'search'; query?: string; category?: string; city?: string }
  | { name: 'business'; businessId: string }
  | { name: 'customer-auth'; mode?: 'login' | 'register' }
  | { name: 'owner-auth'; mode?: 'login' | 'register' }
  | { name: 'customer-dashboard'; tab?: string }
  | { name: 'owner-dashboard'; tab?: string };

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  unreadNotifications: number;
}

export function Navbar({ currentRoute, onNavigate, unreadNotifications }: NavbarProps) {
  const { profile, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const go = (route: AppRoute) => {
    setMobileOpen(false);
    setAccountMenuOpen(false);
    onNavigate(route);
  };

  const handleDashboardNav = () => {
    if (!profile) return go({ name: 'customer-auth', mode: 'login' });
    if (profile.role === 'owner') {
      go({ name: 'owner-dashboard', tab: 'dashboard' });
    } else {
      go({ name: 'customer-dashboard', tab: 'appointments' });
    }
  };

  const handleNotificationsNav = () => {
    if (!profile) return;
    if (profile.role === 'owner') {
      go({ name: 'owner-dashboard', tab: 'notifications' });
    } else {
      go({ name: 'customer-dashboard', tab: 'notifications' });
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Clean single-line brand wordmark with subtle emblem */}
        <button
          type="button"
          onClick={() => go({ name: 'home' })}
          className="inline-flex items-center gap-2.5 text-lg font-display font-bold tracking-tight text-[#0b1220] whitespace-nowrap shrink-0 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 1 1 13 0c0 5.2-6.5 11-6.5 11Z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
          </span>
          <span>LocalConnect</span>
        </button>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => go({ name: 'home' })}
            className={`relative py-5 whitespace-nowrap shrink-0 hover:text-[#0b1220] transition-colors cursor-pointer ${
              currentRoute.name === 'home' ? 'text-[#0b1220] font-semibold' : ''
            }`}
          >
            Discover
            {currentRoute.name === 'home' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => go({ name: 'search' })}
            className={`relative py-5 whitespace-nowrap shrink-0 hover:text-[#0b1220] transition-colors cursor-pointer ${
              currentRoute.name === 'search' ? 'text-[#0b1220] font-semibold' : ''
            }`}
          >
            Directory
            {currentRoute.name === 'search' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              profile?.role === 'owner'
                ? go({ name: 'owner-dashboard', tab: 'dashboard' })
                : go({ name: 'owner-auth', mode: 'register' })
            }
            className={`relative py-5 whitespace-nowrap shrink-0 hover:text-[#0b1220] transition-colors cursor-pointer ${
              currentRoute.name === 'owner-auth' || currentRoute.name === 'owner-dashboard'
                ? 'text-[#0b1220] font-semibold'
                : ''
            }`}
          >
            For Businesses
            {(currentRoute.name === 'owner-auth' || currentRoute.name === 'owner-dashboard') && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
          {profile ? (
            <button
              type="button"
              onClick={handleDashboardNav}
              className={`relative py-5 whitespace-nowrap shrink-0 hover:text-[#0b1220] transition-colors cursor-pointer ${
                currentRoute.name === 'customer-dashboard' ? 'text-[#0b1220] font-semibold' : ''
              }`}
            >
              {profile.role === 'owner' ? 'Owner Studio' : 'My Bookings'}
              {currentRoute.name === 'customer-dashboard' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go({ name: 'customer-auth', mode: 'login' })}
              className={`relative py-5 whitespace-nowrap shrink-0 hover:text-[#0b1220] transition-colors cursor-pointer ${
                currentRoute.name === 'customer-auth' ? 'text-[#0b1220] font-semibold' : ''
              }`}
            >
              Sign In
              {currentRoute.name === 'customer-auth' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          )}
        </nav>

        {/* Zone 3: Single Primary Action / Account */}
        <div className="hidden md:flex items-center gap-3 shrink-0 relative">
          {profile ? (
            <>
              <button
                type="button"
                onClick={handleNotificationsNav}
                aria-label="View notifications"
                className="relative p-2 text-slate-600 hover:text-[#0b1220] hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <Bell className="w-[18px] h-[18px]" />
                {unreadNotifications > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  className="pl-2 pr-3.5 py-1.5 text-sm font-medium text-[#0b1220] bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm rounded-full transition-all whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-full bg-[#0b1220] text-white flex items-center justify-center text-xs font-semibold">
                    {profile.name.charAt(0).toUpperCase() || <User className="w-3.5 h-3.5" />}
                  </span>
                  <span className="max-w-[130px] truncate">{profile.name}</span>
                </button>
                {accountMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-lg py-2 z-50">
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <p className="text-xs font-medium text-slate-500">
                        {profile.role === 'owner' ? 'Business Owner Account' : 'Customer Account'}
                      </p>
                      <p className="text-sm font-semibold text-[#0b1220] truncate mt-0.5">{profile.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDashboardNav}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {profile.role === 'owner' ? 'Business Dashboard' : 'Customer Dashboard'}
                    </button>
                    <button
                      type="button"
                      onClick={handleNotificationsNav}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Notifications ({unreadNotifications})
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void logout().then(() => go({ name: 'home' }));
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => go({ name: 'customer-auth', mode: 'register' })}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0b1220] hover:bg-blue-700 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1.5">
          <button
            type="button"
            onClick={() => go({ name: 'home' })}
            className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => go({ name: 'search' })}
            className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Explore Directory
          </button>
          <button
            type="button"
            onClick={() =>
              profile?.role === 'owner'
                ? go({ name: 'owner-dashboard', tab: 'dashboard' })
                : go({ name: 'owner-auth', mode: 'register' })
            }
            className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            For Businesses
          </button>
          {profile ? (
            <>
              <button
                type="button"
                onClick={handleDashboardNav}
                className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-600 hover:bg-blue-50"
              >
                {profile.role === 'owner' ? 'Owner Studio' : 'My Bookings'}
              </button>
              <button
                type="button"
                onClick={handleNotificationsNav}
                className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Notifications ({unreadNotifications})
              </button>
              <button
                type="button"
                onClick={() => void logout().then(() => go({ name: 'home' }))}
                className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                Sign Out
              </button>
            </>
          ) : (
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => go({ name: 'customer-auth', mode: 'login' })}
                className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 border border-slate-200 rounded-xl"
              >
                Customer Sign In
              </button>
              <button
                type="button"
                onClick={() => go({ name: 'owner-auth', mode: 'login' })}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0b1220] rounded-xl"
              >
                Business Owner Sign In
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
