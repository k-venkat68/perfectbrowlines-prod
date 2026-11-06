import React, { useState } from 'react';
import { SalonUser } from '../types';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound, X } from 'lucide-react';
import { salonApi } from '../api/salonApi';

interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: SalonUser) => void;
}

export const StaffLoginModal: React.FC<StaffLoginModalProps> = ({ isOpen, onClose, onSelectUser }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSigningIn(true);
    try {
      const result = await salonApi.login(username, password);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setPassword('');
      onSelectUser(result.user);
      onClose();
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171411]/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-login-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#E8E3DC] bg-white shadow-[0_28px_90px_rgba(0,0,0,0.32)]"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-[#24211E] via-[#1A1A1A] to-[#11100F] px-8 pb-7 pt-8 text-center">
          <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full border border-[#C5A880]/15" />
          <div className="absolute -right-3 -top-9 h-32 w-32 rounded-full border border-[#C5A880]/10" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign-in"
            className="absolute right-5 top-5 z-10 rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#C5A880]/40 bg-[#C5A880]/10 shadow-[0_0_30px_rgba(197,168,128,0.12)]">
            <LockKeyhole className="h-5 w-5 text-[#D8BD96]" strokeWidth={1.6} />
          </div>
          <span className="relative block text-[10px] font-bold uppercase tracking-[0.24em] text-[#D8BD96]">
            Perfect Browlines · Private Access
          </span>
          <h2 id="staff-login-title" className="mt-2 font-serif text-3xl text-white">
            Staff Portal
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-white/60">
            Sign in to your studio operator or administrator account.
          </p>
        </div>

        <div className="px-8 pb-7 pt-7 sm:px-9">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="staff-username" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#625B54]">
                Username
              </label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A49A8F]" />
                <input
                  id="staff-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  className="w-full rounded-lg border border-[#E7E0D7] bg-[#FCFBF9] py-3 pl-10 pr-3 text-sm text-[#1A1A1A] outline-none transition focus:border-[#B99A6B] focus:bg-white focus:ring-4 focus:ring-[#C5A880]/15"
                />
              </div>
            </div>
            <div>
              <label htmlFor="staff-password" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#625B54]">
                Password
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A49A8F]" />
                <input
                  id="staff-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-[#E7E0D7] bg-[#FCFBF9] py-3 pl-10 pr-3 text-sm text-[#1A1A1A] outline-none transition focus:border-[#B99A6B] focus:bg-white focus:ring-4 focus:ring-[#C5A880]/15"
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSigningIn}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[#1A1A1A] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#302A24] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C5A880]/30 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {isSigningIn ? 'Signing in…' : 'Sign in securely'}
              {!isSigningIn && <ArrowRight className="h-4 w-4 text-[#D8BD96] transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-[#F0ECE6] pt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#978D82]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#B99A6B]" />
            Authorized studio personnel only
          </div>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-[#81786F] transition-colors hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:underline cursor-pointer"
            >
              Back to customer check-in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
