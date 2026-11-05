import React from 'react';
import { SalonLocation, SalonUser } from '../types';
import { Lock, LogOut, UserCheck, Shield } from 'lucide-react';

interface HeaderProps {
  activeTab: 'guest' | 'operator' | 'admin' | 'security';
  setActiveTab: (tab: 'guest' | 'operator' | 'admin' | 'security') => void;
  currentUser: SalonUser | null;
  onOpenStaffModal: () => void;
  onLogoutStaff: () => void;
  locations: SalonLocation[];
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenStaffModal,
  onLogoutStaff,
  locations
}) => {
  const isStaffLoggedIn = currentUser !== null;
  const assignedLocation = currentUser?.assignedLocationId
    ? locations.find(l => l.id === currentUser.assignedLocationId)
    : null;

  return (
    <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E8E3DC] transition-all">
      {/* If Staff or Admin is logged in, show an authenticated staff banner */}
      {isStaffLoggedIn && (
        <div className="bg-[#1A1A1A] text-[#FAF8F5] px-6 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-white/10">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-semibold text-white">
              {currentUser.role === 'SUPER_ADMIN' ? '👑 Admin Session: Founder HQ' : `📍 Studio Operator: ${currentUser.fullName}`}
            </span>
            <span className="text-white/60">
              {assignedLocation ? `(${assignedLocation.name})` : '(All Studios)'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={onLogoutStaff}
              className="text-white/80 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span>Exit to Client View</span>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('guest')}
            className="text-left group cursor-pointer"
          >
            <span className="block text-2xl font-serif tracking-[0.18em] font-medium text-[#1A1A1A] group-hover:text-[#A88B63] transition-colors">
              PERFECT BROWLINES
            </span>
            <span className="block text-[10px] tracking-[0.25em] text-[#C5A880] uppercase -mt-1 font-sans font-medium">
              EYEBROW &amp; BEAUTY STUDIO · BATTLE CREEK &amp; JACKSON, MI
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links (Clean client links when logged out; Staff links when logged in) */}
        <nav className="hidden md:flex items-center gap-8 text-xs tracking-wider uppercase font-medium text-[#4A4643]">
          <button
            onClick={() => setActiveTab('guest')}
            className={`whitespace-nowrap transition-colors pb-1 border-b-2 cursor-pointer ${
              activeTab === 'guest'
                ? 'border-[#C5A880] text-[#1A1A1A] font-semibold'
                : 'border-transparent hover:text-[#1A1A1A] hover:border-[#E8E3DC]'
            }`}
          >
            Book Appointment
          </button>

          {!isStaffLoggedIn ? (
            <>
              <a
                href="#services"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab('guest');
                  const el = document.getElementById('services-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="whitespace-nowrap transition-colors hover:text-[#1A1A1A] hover:border-[#E8E3DC] cursor-pointer"
              >
                Brow &amp; Lash Menu
              </a>
              <a
                href="#locations"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab('guest');
                  const el = document.getElementById('studios-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="whitespace-nowrap transition-colors hover:text-[#1A1A1A] hover:border-[#E8E3DC] cursor-pointer"
              >
                Our Studios
              </a>
            </>
          ) : (
            /* Staff Navigation when Logged in */
            <>
              <button
                onClick={() => setActiveTab('operator')}
                className={`whitespace-nowrap transition-colors pb-1 border-b-2 cursor-pointer ${
                  activeTab === 'operator'
                    ? 'border-[#C5A880] text-[#1A1A1A] font-semibold'
                    : 'border-transparent hover:text-[#1A1A1A] hover:border-[#E8E3DC]'
                }`}
              >
                Studio POS Register
              </button>

              {currentUser?.role === 'SUPER_ADMIN' && (
                <>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`whitespace-nowrap transition-colors pb-1 border-b-2 cursor-pointer ${
                      activeTab === 'admin'
                        ? 'border-[#C5A880] text-[#1A1A1A] font-semibold'
                        : 'border-transparent hover:text-[#1A1A1A] hover:border-[#E8E3DC]'
                    }`}
                  >
                    Executive Dashboard
                  </button>
                  <button
                    onClick={() => setActiveTab('security')}
                    className={`whitespace-nowrap transition-colors pb-1 border-b-2 cursor-pointer ${
                      activeTab === 'security'
                        ? 'border-[#C5A880] text-[#1A1A1A] font-semibold'
                        : 'border-transparent hover:text-[#1A1A1A] hover:border-[#E8E3DC]'
                    }`}
                  >
                    Security &amp; Invariants
                  </button>
                </>
              )}
            </>
          )}
        </nav>

        {/* Zone 3: Staff & Admin Portal Trigger / Auth button */}
        <div className="flex items-center gap-3 shrink-0">
          {!isStaffLoggedIn ? (
            <button
              onClick={onOpenStaffModal}
              className="px-3.5 py-1.5 border border-[#E8E3DC] hover:border-[#1A1A1A] text-[#4A4643] hover:text-[#1A1A1A] text-xs uppercase tracking-wider font-semibold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer bg-white"
            >
              <Lock className="w-3.5 h-3.5 text-[#C5A880]" />
              <span>Staff Portal</span>
            </button>
          ) : (
            <button
              onClick={onLogoutStaff}
              className="px-3.5 py-1.5 border border-[#E8E3DC] hover:border-red-600 text-red-600 text-xs uppercase tracking-wider font-semibold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer bg-white"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
