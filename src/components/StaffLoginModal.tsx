import React, { useState } from 'react';
import { SalonUser } from '../types';
import { Lock, X } from 'lucide-react';
import { salonApi } from '../api/salonApi';

interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: SalonUser) => void;
}

export const StaffLoginModal: React.FC<StaffLoginModalProps> = ({ isOpen, onClose, onSelectUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSigningIn(true);
    const result = await salonApi.login(email, password);
    setIsSigningIn(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPassword('');
    onSelectUser(result.user);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E8E3DC] rounded-sm max-w-md w-full p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign-in"
          className="absolute top-6 right-6 text-[#7A7571] hover:text-[#1A1A1A] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center">
            <Lock className="w-5 h-5 text-[#C5A880]" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#C5A880] font-bold block mb-1">
            Authorized Personnel Only
          </span>
          <h2 className="text-2xl font-serif text-[#1A1A1A]">Staff Portal</h2>
          <p className="text-xs text-[#7A7571] mt-1">
            Sign in with your studio operator or administrator account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staff-email" className="block text-xs font-semibold text-[#4A4643] mb-1">
              Work email
            </label>
            <input
              id="staff-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="w-full px-3 py-2.5 border border-[#E8E3DC] rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A880]/40"
            />
          </div>
          <div>
            <label htmlFor="staff-password" className="block text-xs font-semibold text-[#4A4643] mb-1">
              Password
            </label>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full px-3 py-2.5 border border-[#E8E3DC] rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A880]/40"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#2C2926] text-white text-sm font-semibold rounded-sm disabled:opacity-60 cursor-pointer"
          >
            {isSigningIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="pt-4 mt-5 border-t border-[#F5F1EB] flex justify-end">
          <button type="button" onClick={onClose} className="text-xs text-[#7A7571] hover:text-[#1A1A1A] cursor-pointer">
            Back to customer check-in
          </button>
        </div>
      </div>
    </div>
  );
};
