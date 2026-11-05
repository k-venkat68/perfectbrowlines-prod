import { VisitItem, ClosingRecord, ShopSettings, SalonUser } from '../types';

export const salonApi = {
  async fetchSession(): Promise<SalonUser | null> {
    try {
      const res = await fetch('/api/v1/auth/session');
      const data = await res.json();
      return data.success ? data.user : null;
    } catch (err) {
      console.error('[salonApi] session check failed', err);
      return null;
    }
  },

  async login(email: string, password: string): Promise<{ user: SalonUser } | { error: string }> {
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.user) {
        return { error: data.error || `Sign-in failed (HTTP ${res.status}).` };
      }
      return { user: data.user };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      console.error('[salonApi] login failed', message);
      return { error: `Could not reach the app server. ${message}` };
    }
  },

  async logout(): Promise<void> {
    const res = await fetch('/api/v1/auth/logout', { method: 'POST' });
    if (!res.ok) throw new Error('Could not sign out.');
  },

  async checkHealth(): Promise<{ status: string; mongodb: { status: string; readyState: number } }> {
    try {
      const res = await fetch('/api/v1/health');
      if (!res.ok) throw new Error('Health check failed');
      return await res.json();
    } catch {
      return { status: 'offline', mongodb: { status: 'demo-memory-mode', readyState: 0 } };
    }
  },

  async fetchVisits(params?: { date?: string; loc?: number; from?: string; to?: string }): Promise<VisitItem[]> {
    try {
      const sp = new URLSearchParams();
      if (params?.date) sp.append('date', params.date);
      if (params?.loc !== undefined) sp.append('loc', String(params.loc));
      if (params?.from) sp.append('from', params.from);
      if (params?.to) sp.append('to', params.to);

      const url = `/api/v1/visits${sp.toString() ? '?' + sp.toString() : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.visits)) {
        return data.visits;
      }
      return [];
    } catch (err) {
      console.error('[salonApi] fetchVisits failed', err);
      return [];
    }
  },

  async createVisit(
    payload: { loc: number; date: string; name: string; phone: string; services: string[]; note: string }
  ): Promise<{ visit: VisitItem } | { error: string }> {
    try {
      const res = await fetch('/api/v1/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.visit) {
        return { error: data.error || `Check-in request failed (HTTP ${res.status}).` };
      }
      return { visit: data.visit };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      console.error('[salonApi] createVisit error', message);
      return { error: `Could not reach the app server; check-in was not saved. ${message}` };
    }
  },

  async updateVisit(id: string, updates: { status: 'done'; tip: number; pay: 'cash' | 'card' }): Promise<VisitItem | null> {
    try {
      const res = await fetch(`/api/v1/visits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error('[salonApi] updateVisit rejected', data.error || res.statusText);
        return null;
      }
      return data.success ? data.visit : null;
    } catch (err) {
      console.error('[salonApi] updateVisit error', err);
      return null;
    }
  },

  async fetchClosings(): Promise<ClosingRecord[]> {
    try {
      const res = await fetch('/api/v1/closings');
      const data = await res.json();
      if (data.success && Array.isArray(data.closings)) {
        return data.closings;
      }
      return [];
    } catch {
      return [];
    }
  },

  async saveClosing(doc: ClosingRecord): Promise<ClosingRecord | null> {
    try {
      const res = await fetch('/api/v1/closings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      const data = await res.json();
      return data.success ? data.closing : null;
    } catch {
      return null;
    }
  },

  async reopenClosing(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/v1/closings/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  },

  async fetchSettings(): Promise<ShopSettings | null> {
    try {
      const res = await fetch('/api/v1/settings');
      const data = await res.json();
      return data.success ? data.settings : null;
    } catch {
      return null;
    }
  },

  async saveSettings(settings: ShopSettings): Promise<boolean> {
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  },

  async configureMongo(mongoUri: string): Promise<{ success: boolean; status: string; message: string; error?: string }> {
    try {
      const res = await fetch('/api/v1/config/mongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mongoUri })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, status: 'error', message: err.message };
    }
  }
};
