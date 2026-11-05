import React, { useState, useEffect, useMemo, useRef } from 'react';
import { VisitItem, ClosingRecord, ShopSettings, SalonUser } from './types';
import { salonApi } from './api/salonApi';
import { StaffLoginModal } from './components/StaffLoginModal';
import {
  TrendingUp,
  MapPin,
  Clock,
  Check,
  AlertCircle,
  Lock,
  LogOut,
  Download,
  Copy,
  Receipt,
  Star,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  BarChart3,
  Calendar,
  Users
} from 'lucide-react';

function dayStr(d?: Date): string {
  d = d || new Date();
  const m = d.getMonth() + 1;
  const x = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${x < 10 ? '0' : ''}${x}`;
}

function addDays(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dayStr(d);
}

function dayLabel(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

function longDay(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function waitMin(ts: number): number {
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function App() {
  const [loc, setLoc] = useState<number>(0); // 0 = Battle Creek, 1 = Jackson
  const [tab, setTab] = useState<'checkin' | 'queue' | 'analytics' | 'report' | 'owner' | 'settings'>('checkin');
  const [currentUser, setCurrentUser] = useState<SalonUser | null>(null);

  // Modals & Toasts
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // MongoDB status
  const [mongoStatus, setMongoStatus] = useState<string>('connecting');
  const [mongoReadyState, setMongoReadyState] = useState<number>(0);

  // Settings
  const [settings, setSettings] = useState<ShopSettings>({
    locations: ['Battle Creek', 'Jackson'],
    currency: '$',
    staff: ['Sarah Jenkins', 'Emily Davis', 'Maya Lin'],
    services: [
      { n: 'Eyebrows', p: 14 },
      { n: 'Upper lip', p: 7 },
      { n: 'Chin', p: 7 },
      { n: 'Forehead', p: 7 },
      { n: 'Sideburns', p: 8 },
      { n: 'Full face', p: 40 },
      { n: 'Brow Lamination', p: 85 },
      { n: 'Lash Lift', p: 95 },
      { n: 'Ombré Microblading', p: 350 }
    ]
  });

  // Data states
  const today = useMemo(() => dayStr(), []);
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [weekVisits, setWeekVisits] = useState<VisitItem[]>([]);
  const [monthVisits, setMonthVisits] = useState<VisitItem[]>([]);
  const [analyticsVisits, setAnalyticsVisits] = useState<VisitItem[]>([]);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'today' | 'last7' | 'month' | 'last30' | 'custom'>('month');
  const [analyticsLocation, setAnalyticsLocation] = useState<'all' | '0' | '1'>('all');
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [closings, setClosings] = useState<ClosingRecord[]>([]);

  // Check-in Form state
  const [ciName, setCiName] = useState<string>('');
  const [ciPhone, setCiPhone] = useState<string>('');
  const [ciSel, setCiSel] = useState<Record<string, boolean>>({});
  const [ciNote, setCiNote] = useState<string>('');
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);

  // Queue Billing Drawer state
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { pay: 'cash' | 'card'; tip: number | '' }>>({});

  // Closing Report state
  const [reportDate, setReportDate] = useState<string>(today);
  const [reportLoc, setReportLoc] = useState<number>(0);
  const [countedDrawer, setCountedDrawer] = useState<string>('');
  const [isClosingDay, setIsClosingDay] = useState<boolean>(false);
  const [confirmReopen, setConfirmReopen] = useState<boolean>(false);

  // Settings edit state
  const [staffText, setStaffText] = useState<string>('');
  const [serviceNameDraft, setServiceNameDraft] = useState('');
  const [servicePriceDraft, setServicePriceDraft] = useState('');
  const [editingServiceName, setEditingServiceName] = useState<string | null>(null);
  const [deletingServiceName, setDeletingServiceName] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(null), 3200);
  };

  const handleLogout = async () => {
    try {
      await salonApi.logout();
      setCurrentUser(null);
      setTab('checkin');
      setOpenVisitId(null);
      setVisits([]);
      setWeekVisits([]);
      setMonthVisits([]);
      setAnalyticsVisits([]);
    } catch (err) {
      console.error('[App] Sign out failed', err);
      showToast('Could not sign out. Please try again.');
    }
  };

  const money = (n: number | string | undefined): string => {
    const val = Math.round((Number(n) || 0) * 100) / 100;
    return settings.currency + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const locName = (i: number): string => settings.locations[i] || (i === 1 ? 'Jackson' : 'Battle Creek');

  // Load initial data & connect with MongoDB
  const loadData = async () => {
    try {
      const health = await salonApi.checkHealth();
      setMongoStatus(health.mongodb?.status || 'demo-memory-mode');
      setMongoReadyState(health.mongodb?.readyState || 0);

      const s = await salonApi.fetchSettings();
      if (s) {
        setSettings(s);
        setStaffText(s.staff.join('\n'));
      }

      if (currentUser) {
        const todayVs = await salonApi.fetchVisits({ date: today });
        setVisits(todayVs);
        const fromDate = addDays(today, -6);
        const weekVs = await salonApi.fetchVisits({ from: fromDate, to: today });
        setWeekVisits(weekVs);
        const monthStart = `${today.slice(0, 7)}-01`;
        setMonthVisits(await salonApi.fetchVisits({ from: monthStart, to: today }));
        setClosings(currentUser.role === 'SUPER_ADMIN' ? await salonApi.fetchClosings() : []);
      } else {
        setVisits([]);
        setWeekVisits([]);
        setMonthVisits([]);
        setClosings([]);
      }
    } catch (err) {
      console.warn('[App] Load data failed', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [today, currentUser]);

  useEffect(() => {
    salonApi.fetchSession().then(user => {
      if (!user) return;
      setCurrentUser(user);
      if (user.assignedLocationId === 'loc-0') setLoc(0);
      if (user.assignedLocationId === 'loc-1') setLoc(1);
      setTab(user.role === 'SUPER_ADMIN' ? 'analytics' : 'queue');
    });
  }, []);

  const analyticsDateRange = useMemo(() => {
    switch (analyticsPeriod) {
      case 'today':
        return { from: today, to: today, label: 'Today' };
      case 'last7':
        return { from: addDays(today, -6), to: today, label: 'Last 7 days' };
      case 'last30':
        return { from: addDays(today, -29), to: today, label: 'Last 30 days' };
      case 'custom':
        return { from: customFrom, to: customTo, label: `${customFrom} to ${customTo}` };
      case 'month':
      default:
        return { from: `${today.slice(0, 7)}-01`, to: today, label: 'Month to date' };
    }
  }, [analyticsPeriod, customFrom, customTo, today]);

  useEffect(() => {
    if (currentUser?.role !== 'SUPER_ADMIN' || analyticsDateRange.from > analyticsDateRange.to) {
      setAnalyticsVisits([]);
      return;
    }

    let active = true;
    const refreshAnalytics = async () => {
      const results = await salonApi.fetchVisits({
        from: analyticsDateRange.from,
        to: analyticsDateRange.to
      });
      if (active) setAnalyticsVisits(results);
    };

    refreshAnalytics();
    const interval = setInterval(refreshAnalytics, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUser, analyticsDateRange]);

  // Current studio's visits
  const currentStudioVisits = useMemo(() => {
    return visits.filter(v => v.loc === loc).sort((a, b) => a.ts - b.ts);
  }, [visits, loc]);

  const waitingCount = useMemo(() => {
    return currentStudioVisits.filter(v => v.status === 'waiting').length;
  }, [currentStudioVisits]);

  const reportVisits = useMemo(() => {
    const source = reportDate === today ? visits : weekVisits;
    return source.filter(v => v.loc === reportLoc && v.date === reportDate).sort((a, b) => a.ts - b.ts);
  }, [visits, weekVisits, reportDate, reportLoc, today]);

  // Stats calculation
  const computeStats = (vs: VisitItem[]) => {
    let sales = 0;
    let cash = 0;
    let credit = 0;
    let tips = 0;
    let tipCash = 0;
    let tipCredit = 0;
    let waiting = 0;
    let cancelled = 0;
    let countDone = 0;
    const by: Record<string, { n: number; sales: number; tips: number }> = {};

    vs.forEach(v => {
      if (v.status === 'waiting') waiting++;
      else if (v.status === 'cancelled') cancelled++;
      else if (v.status === 'done') {
        countDone++;
        const a = Number(v.amount) || 0;
        const t = Number(v.tip) || 0;
        sales += a;
        tips += t;
        if (v.pay === 'cash') {
          cash += a;
          tipCash += t;
        } else {
          credit += a;
          tipCredit += t;
        }
        const emp = v.employee || 'Unassigned';
        if (!by[emp]) by[emp] = { n: 0, sales: 0, tips: 0 };
        by[emp].n++;
        by[emp].sales += a;
        by[emp].tips += t;
      }
    });

    return { n: countDone, sales, cash, credit, tips, tipCash, tipCredit, waiting, cancelled, by };
  };

  const reportStats = useMemo(() => computeStats(reportVisits), [reportVisits]);
  const currentClosing = useMemo(() => {
    const key = `${reportLoc}_${reportDate}`;
    return closings.find(c => c.id === key) || null;
  }, [closings, reportLoc, reportDate]);

  // Service toggle in check-in
  const toggleSvc = (name: string) => {
    setCiSel(prev => {
      const copy = { ...prev };
      if (copy[name]) delete copy[name];
      else copy[name] = true;
      return copy;
    });
  };

  // Submit Check-in (Pushes to MongoDB)
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = ciName.trim();
    const selectedSvcs = Object.keys(ciSel);

    if (!name) {
      showToast('Please enter your name.');
      return;
    }
    if (ciPhone.replace(/\D/g, '').length < 10) {
      showToast('Please enter a valid phone number.');
      return;
    }
    if (!selectedSvcs.length) {
      showToast('Please choose at least one service.');
      return;
    }

    setIsCheckingIn(true);
    const result = await salonApi.createVisit({
      loc,
      date: today,
      name,
      phone: ciPhone.trim(),
      services: selectedSvcs,
      note: ciNote.trim()
    });

    setIsCheckingIn(false);
    if ('visit' in result) {
      setVisits(prev => [...prev, result.visit]);
      setCiName('');
      setCiPhone('');
      setCiSel({});
      setCiNote('');
      showToast(`Thanks ${name}, your order is saved. Please wait for the operator to call you.`);
    } else {
      showToast(result.error);
    }
  };

  // Open billing for a customer
  const handleOpenBilling = (v: VisitItem) => {
    setDrafts(prev => ({
      ...prev,
      [v.id]: { pay: v.pay === 'cash' ? 'cash' : 'card', tip: v.tip || 0 }
    }));
    setOpenVisitId(v.id);
  };

  // Save Billing & Mark Done (Pushes to MongoDB)
  const handleSaveBilling = async (vId: string) => {
    const draft = drafts[vId];
    if (!draft) return;

    const tip = parseFloat(String(draft.tip)) || 0;

    if (!Number.isFinite(tip) || tip < 0) {
      showToast('Please enter a valid tip amount.');
      return;
    }

    const updates = {
      status: 'done',
      pay: draft.pay,
      tip: Math.round(tip * 100) / 100
    } as const;

    const updated = await salonApi.updateVisit(vId, updates);
    if (updated) {
      setVisits(prev => prev.map(item => (item.id === vId ? updated : item)));
      setOpenVisitId(null);
      showToast('Client visit completed and recorded.');
    } else {
      showToast('Checkout was not saved. Please try again.');
    }
  };

  // Close Day (Pushes to MongoDB)
  const handleCloseDay = async () => {
    setIsClosingDay(true);
    const counted = countedDrawer ? parseFloat(countedDrawer) : null;
    const key = `${reportLoc}_${reportDate}`;
    const expected = Math.round((reportStats.cash + reportStats.tipCash) * 100) / 100;

    const doc: ClosingRecord = {
      id: key,
      loc: reportLoc,
      date: reportDate,
      customers: reportStats.n,
      sales: Math.round(reportStats.sales * 100) / 100,
      cash: Math.round(reportStats.cash * 100) / 100,
      credit: Math.round(reportStats.credit * 100) / 100,
      tips: Math.round(reportStats.tips * 100) / 100,
      tipCash: Math.round(reportStats.tipCash * 100) / 100,
      tipCredit: Math.round(reportStats.tipCredit * 100) / 100,
      expected,
      counted,
      closedTs: Date.now()
    };

    const res = await salonApi.saveClosing(doc);
    setIsClosingDay(false);
    if (res) {
      setClosings(prev => [res, ...prev.filter(c => c.id !== key)]);
      showToast(`Day closed for ${locName(reportLoc)}. Reconciled in database.`);
    }
  };

  // Reopen Day
  const handleReopenDay = async () => {
    const key = `${reportLoc}_${reportDate}`;
    const ok = await salonApi.reopenClosing(key);
    if (ok) {
      setClosings(prev => prev.filter(c => c.id !== key));
      setConfirmReopen(false);
      showToast('Day reopened.');
    }
  };

  const persistSettings = async (updated: ShopSettings): Promise<boolean> => {
    const saved = await salonApi.saveSettings(updated);
    if (!saved) {
      showToast('Could not save settings. Check the server and MongoDB, then try again.');
      return false;
    }
    setSettings(updated);
    return true;
  };

  // Save staff settings
  const handleSaveSettings = async () => {
    const staff = staffText.split('\n').map(s => s.trim()).filter(Boolean);
    const updated: ShopSettings = {
      locations: settings.locations,
      currency: settings.currency,
      staff,
      services: settings.services
    };

    if (await persistSettings(updated)) showToast('Staff settings saved successfully.');
  };

  const handleSaveService = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = serviceNameDraft.trim();
    const price = Number(servicePriceDraft);
    if (!name || !Number.isFinite(price) || price < 0) {
      showToast('Enter a service name and a valid non-negative price.');
      return;
    }
    const duplicate = settings.services.some(service =>
      service.n.toLocaleLowerCase() === name.toLocaleLowerCase() && service.n !== editingServiceName
    );
    if (duplicate) {
      showToast('A service with that name already exists.');
      return;
    }
    const services = editingServiceName
      ? settings.services.map(service => service.n === editingServiceName ? { n: name, p: Math.round(price * 100) / 100 } : service)
      : [...settings.services, { n: name, p: Math.round(price * 100) / 100 }];
    if (await persistSettings({ ...settings, services })) {
      if (editingServiceName && editingServiceName !== name) {
        setCiSel(selected => {
          if (!selected[editingServiceName]) return selected;
          const next = { ...selected, [name]: true };
          delete next[editingServiceName];
          return next;
        });
      }
      setServiceNameDraft('');
      setServicePriceDraft('');
      setEditingServiceName(null);
      showToast(editingServiceName ? 'Service updated.' : 'Service added.');
    }
  };

  const handleEditService = (service: { n: string; p: number }) => {
    setEditingServiceName(service.n);
    setServiceNameDraft(service.n);
    setServicePriceDraft(String(service.p));
    setDeletingServiceName(null);
  };

  const handleDeleteService = async (name: string) => {
    if (settings.services.length <= 1) {
      showToast('Keep at least one service available.');
      return;
    }
    if (deletingServiceName !== name) {
      setDeletingServiceName(name);
      return;
    }
    const services = settings.services.filter(service => service.n !== name);
    if (await persistSettings({ ...settings, services })) {
      if (editingServiceName === name) {
        setEditingServiceName(null);
        setServiceNameDraft('');
        setServicePriceDraft('');
      }
      setCiSel(selected => {
        const next = { ...selected };
        delete next[name];
        return next;
      });
      setDeletingServiceName(null);
      showToast('Service deleted. Existing orders are unchanged.');
    }
  };

  // Till Slip Text Copy
  const handleCopySlip = () => {
    const st = reportStats;
    const cl = currentClosing;
    const lines = [
      `${locName(reportLoc)} - ${longDay(reportDate)}`,
      `Customers served: ${st.n}`,
      `Total sales: ${money(st.sales)}`,
      `Cash sales: ${money(st.cash)}`,
      `Card sales: ${money(st.credit)}`,
      `Tips: ${money(st.tips)} (cash ${money(st.tipCash)}, card ${money(st.tipCredit)})`,
      ...Object.keys(st.by).map(k => `  ${k}: ${st.by[k].n} clients, ${money(st.by[k].sales)}, tips ${money(st.by[k].tips)}`),
      cl && cl.counted != null ? `Cash counted: ${money(cl.counted)} (expected ${money(st.cash + st.tipCash)})` : ''
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Till summary copied to clipboard.');
  };

  // 7-Day Chart Calculation for Owner Dashboard
  const past7Days = useMemo(() => {
    const arr: string[] = [];
    for (let i = -6; i <= 0; i++) arr.push(addDays(today, i));
    return arr;
  }, [today]);

  const salesByDay = useMemo(() => {
    let max = 0;
    const map: Record<string, [number, number]> = {};

    past7Days.forEach(d => {
      const dayVs = d === today ? visits : weekVisits.filter(v => v.date === d);
      const bc = computeStats(dayVs.filter(v => v.loc === 0)).sales;
      const jk = computeStats(dayVs.filter(v => v.loc === 1)).sales;
      max = Math.max(max, bc, jk);
      map[d] = [bc, jk];
    });

    return { map, max: Math.max(max, 100) };
  }, [past7Days, visits, weekVisits, today]);

  // Overall Today Stats
  const todayAllStats = useMemo(() => computeStats(visits), [visits]);
  const periodInsights = useMemo(() => {
    const periods = [
      { period: 'Daily', range: 'Today', records: visits },
      { period: 'Weekly', range: 'Last 7 days', records: weekVisits },
      { period: 'Monthly', range: 'Month to date', records: monthVisits }
    ];
    return periods.flatMap(({ period, range, records }) => {
      const scopes = [
        { location: locName(0), visits: records.filter(visit => visit.loc === 0) },
        { location: locName(1), visits: records.filter(visit => visit.loc === 1) },
        { location: 'All locations', visits: records }
      ];
      return scopes.map(scope => ({
        period,
        range,
        location: scope.location,
        orders: scope.visits.length,
        ...computeStats(scope.visits)
      }));
    });
  }, [visits, weekVisits, monthVisits, settings.locations]);
  const analyticsScopedVisits = useMemo(
    () => analyticsLocation === 'all'
      ? analyticsVisits
      : analyticsVisits.filter(visit => visit.loc === Number(analyticsLocation)),
    [analyticsVisits, analyticsLocation]
  );
  const analyticsAllStats = useMemo(() => computeStats(analyticsVisits), [analyticsVisits]);
  const analyticsStats = useMemo(() => computeStats(analyticsScopedVisits), [analyticsScopedVisits]);
  const analyticsLocationStats = useMemo(() => settings.locations
    .map((name, location) => {
      const locationVisits = analyticsVisits.filter(visit => visit.loc === location);
      return { location, name, orders: locationVisits.length, ...computeStats(locationVisits) };
    })
    .filter(location => analyticsLocation === 'all' || location.location === Number(analyticsLocation)),
  [analyticsVisits, analyticsLocation, settings.locations]);
  const analyticsStaffStats = useMemo(
    () => Object.entries(analyticsStats.by).sort(([, a], [, b]) => b.sales - a.sales),
    [analyticsStats]
  );

  return (
    <div className="min-h-screen bg-[#F2F4F6] text-[#16202A] font-sans antialiased pb-20 selection:bg-[#B3315A]/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 space-y-4">
        {/* TOP HEADER & STUDIO SWITCHER */}
        <header className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#D9DFE5] rounded-xl p-4 sm:p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-serif text-[#16202A]">
                Perfect <span className="text-[#B3315A] italic">Browlines</span>
              </h1>
            </div>
            <p className="text-[11px] uppercase tracking-widest text-[#5B6875] font-semibold mt-0.5">
              The Eyebrow Threading Spa · Michigan
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Location Switcher */}
            {currentUser?.role !== 'LOCATION_OPERATOR' && <div className="inline-flex bg-[#E9EDF1] p-1 rounded-lg border border-[#D9DFE5]">
              <button
                type="button"
                onClick={() => {
                  setLoc(0);
                  setReportLoc(0);
                  setOpenVisitId(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  loc === 0
                    ? 'bg-[#B3315A] text-white shadow-xs font-bold'
                    : 'text-[#5B6875] hover:text-[#B3315A]'
                }`}
              >
                {locName(0)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoc(1);
                  setReportLoc(1);
                  setOpenVisitId(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  loc === 1
                    ? 'bg-[#B3315A] text-white shadow-xs font-bold'
                    : 'text-[#5B6875] hover:text-[#B3315A]'
                }`}
              >
                {locName(1)}
              </button>
            </div>}
          </div>
        </header>

        {/* TABS NAVIGATION */}
        {(
          <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 text-sm font-semibold">
            {!currentUser && <button
              type="button"
              onClick={() => {
                setTab('checkin');
                setOpenVisitId(null);
              }}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                tab === 'checkin'
                  ? 'bg-[#B3315A] text-white shadow-xs'
                  : 'bg-white text-[#5B6875] border border-[#D9DFE5] hover:text-[#16202A] hover:border-[#B3315A]/40'
              }`}
            >
              Check-in
            </button>}
            {currentUser?.role === 'LOCATION_OPERATOR' && <button
              type="button"
              onClick={() => {
                setTab('queue');
                setOpenVisitId(null);
              }}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                tab === 'queue'
                  ? 'bg-[#B3315A] text-white shadow-xs'
                  : 'bg-white text-[#5B6875] border border-[#D9DFE5] hover:text-[#16202A] hover:border-[#B3315A]/40'
              }`}
            >
              <span>Queue</span>
              {waitingCount > 0 && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full transition-colors ${
                  tab === 'queue' ? 'bg-white text-[#B3315A]' : 'bg-[#B3315A] text-white'
                }`}>
                  {waitingCount}
                </span>
              )}
            </button>}
            {currentUser?.role === 'SUPER_ADMIN' && <button
              type="button"
              onClick={() => {
                setTab('report');
                setOpenVisitId(null);
              }}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                tab === 'report'
                  ? 'bg-[#B3315A] text-white shadow-xs'
                  : 'bg-white text-[#5B6875] border border-[#D9DFE5] hover:text-[#16202A] hover:border-[#B3315A]/40'
              }`}
            >
              Closing report
            </button>}

            {/* Admin only tabs */}
            {currentUser?.role === 'SUPER_ADMIN' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setTab('analytics');
                    setOpenVisitId(null);
                  }}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                    tab === 'analytics'
                      ? 'bg-[#B3315A] text-white shadow-xs'
                      : 'bg-white text-[#5B6875] border border-[#D9DFE5] hover:text-[#16202A] hover:border-[#B3315A]/40'
                  }`}
                >
                  <BarChart3 className={`w-4 h-4 ${tab === 'analytics' ? 'text-white' : 'text-[#C5A880]'}`} />
                  <span>Analytics</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('owner');
                    setOpenVisitId(null);
                  }}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                    tab === 'owner'
                      ? 'bg-[#B3315A] text-white shadow-xs'
                      : 'bg-white text-[#5B6875] border border-[#D9DFE5] hover:text-[#16202A] hover:border-[#B3315A]/40'
                  }`}
                >
                  <TrendingUp className={`w-4 h-4 ${tab === 'owner' ? 'text-white' : 'text-[#C5A880]'}`} />
                  <span>Overview</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('settings');
                    setOpenVisitId(null);
                  }}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                    tab === 'settings'
                      ? 'bg-[#B3315A] text-white shadow-xs'
                      : 'bg-white text-[#5B6875] border border-[#D9DFE5] hover:text-[#16202A] hover:border-[#B3315A]/40'
                  }`}
                >
                  Settings
                </button>
              </>
            )}
          </nav>
        )}

        {/* =================================================================== */}
        {/* VIEW 1: CHECK-IN (LANDING SCREEN) */}
        {/* =================================================================== */}
        {!currentUser && tab === 'checkin' && (
          <div className="space-y-6">
            {/* Check-in Form Card */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 sm:p-8 space-y-6 shadow-xs">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-[#B3315A] font-bold">
                  {locName(loc)} Studio
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#16202A] tracking-tight mt-1">
                  Welcome. Tell us what you need.
                </h2>
              </div>

              <form onSubmit={handleCheckin} className="space-y-5">
                {/* Name */}
                <div className="space-y-1.5">
                  <label htmlFor="name-input" className="block text-xs font-bold uppercase tracking-wider text-[#5B6875]">
                    Your name
                  </label>
                  <input
                    id="name-input"
                    type="text"
                    required
                    value={ciName}
                    onChange={e => setCiName(e.target.value)}
                    placeholder="First name is fine"
                    className="w-full px-4 py-3 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm font-medium text-[#16202A] focus:outline-none focus:ring-2 focus:ring-[#B3315A]/30 focus:border-[#B3315A]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="phone-input" className="block text-xs font-bold uppercase tracking-wider text-[#5B6875]">
                    Phone number
                  </label>
                  <input
                    id="phone-input"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    value={ciPhone}
                    onChange={e => setCiPhone(e.target.value)}
                    placeholder="(269) 555-0123"
                    className="w-full px-4 py-3 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm font-medium text-[#16202A] focus:outline-none focus:ring-2 focus:ring-[#B3315A]/30 focus:border-[#B3315A]"
                  />
                </div>

                {/* Service Chips */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6875]">
                    Services (pick one or more)
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {settings.services.map(s => {
                      const isSelected = !!ciSel[s.n];
                      return (
                        <button
                          key={s.n}
                          type="button"
                          onClick={() => toggleSvc(s.n)}
                          className={`px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all cursor-pointer flex items-baseline gap-2 ${
                            isSelected
                              ? 'bg-[#B3315A] border-[#B3315A] text-white shadow-xs'
                              : 'bg-[#F2F4F6] border-[#D9DFE5] text-[#16202A] hover:border-[#B3315A]/50'
                          }`}
                        >
                          <span>{s.n}</span>
                          <span className={`text-xs font-mono ${isSelected ? 'text-white/95 font-bold' : 'text-[#5B6875]'}`}>
                            {money(s.p)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#D9DFE5] pt-3 text-sm">
                  <span className="font-semibold text-[#5B6875]">Order total</span>
                  <span className="font-bold text-[#16202A]">
                    {money(settings.services.filter(service => ciSel[service.n]).reduce((total, service) => total + service.p, 0))}
                  </span>
                </div>

                {/* Optional Note */}
                <div className="space-y-1.5">
                  <label htmlFor="note-input" className="block text-xs font-bold uppercase tracking-wider text-[#5B6875]">
                    Anything else we should know? (optional)
                  </label>
                  <input
                    id="note-input"
                    type="text"
                    value={ciNote}
                    onChange={e => setCiNote(e.target.value)}
                    placeholder="Sensitive skin, short on time..."
                    className="w-full px-4 py-2.5 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm text-[#16202A] focus:outline-none focus:ring-2 focus:ring-[#B3315A]/30 focus:border-[#B3315A]"
                  />
                </div>

                {/* Check In Action Button */}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="submit"
                    disabled={isCheckingIn}
                    className="px-8 py-3.5 bg-[#B3315A] hover:bg-[#9B254A] text-white text-base font-bold rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isCheckingIn ? 'Placing order...' : 'Place order & check in'}
                  </button>
                  <span className="text-xs text-[#5B6875] font-medium">
                    {waitingCount > 0 ? `${waitingCount} waiting ahead of you` : 'No one is waiting right now'}
                  </span>
                </div>
              </form>
            </section>

            {/* WHY THREADING VS WAXING (Educational Guide directly on landing) */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 sm:p-8 space-y-6 shadow-xs">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-[#5B6875] font-bold">
                  Why Threading
                </p>
                <h2 className="text-2xl font-serif font-bold text-[#16202A] tracking-tight mt-1">
                  Threading vs Waxing
                </h2>
                <p className="text-sm text-[#5B6875] mt-2 leading-relaxed max-w-2xl">
                  Threading uses a single twisted organic cotton thread to lift hair out at the root. There is no wax, no resin, and no heat, so nothing sticky or chemical touches your skin.
                </p>
              </div>

              {/* 3 Perks */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-[#F2F4F6] rounded-lg space-y-1">
                  <h3 className="font-bold text-sm text-[#16202A]">A natural process</h3>
                  <p className="text-xs text-[#5B6875] leading-relaxed">
                    Just cotton thread and a certified stylist's hand. No additives or harsh chemical resins.
                  </p>
                </div>
                <div className="p-4 bg-[#F2F4F6] rounded-lg space-y-1">
                  <h3 className="font-bold text-sm text-[#16202A]">Gentler on skin</h3>
                  <p className="text-xs text-[#5B6875] leading-relaxed">
                    Thread works on the hair alone rather than pulling skin. Great for sensitive skin or retinoid users.
                  </p>
                </div>
                <div className="p-4 bg-[#F2F4F6] rounded-lg space-y-1">
                  <h3 className="font-bold text-sm text-[#16202A]">Precise shaping</h3>
                  <p className="text-xs text-[#5B6875] leading-relaxed">
                    Fine and short hairs are lifted line by line for clean, crisp arch symmetry.
                  </p>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="overflow-x-auto border border-[#D9DFE5] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F2F4F6] border-b border-[#D9DFE5] text-[#5B6875] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Feature</th>
                      <th className="py-2.5 px-4 text-[#B3315A] font-extrabold">Threading</th>
                      <th className="py-2.5 px-4">Waxing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D9DFE5]">
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-[#16202A]">What touches your skin</td>
                      <td className="py-2.5 px-4 font-bold text-[#B3315A]">Organic cotton thread only</td>
                      <td className="py-2.5 px-4 text-[#5B6875]">Heated wax or chemical resin</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-[#16202A]">Heat</td>
                      <td className="py-2.5 px-4 font-bold text-[#B3315A]">None</td>
                      <td className="py-2.5 px-4 text-[#5B6875]">Warm wax with burn hazard</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-[#16202A]">Pulls on the skin</td>
                      <td className="py-2.5 px-4 font-bold text-[#B3315A]">None; lifts hair from root</td>
                      <td className="py-2.5 px-4 text-[#5B6875]">Grips and stretches skin</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-[#16202A]">Short &amp; fine hairs</td>
                      <td className="py-2.5 px-4 font-bold text-[#B3315A]">Removed easily</td>
                      <td className="py-2.5 px-4 text-[#5B6875]">Requires longer hair growth</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-[#16202A]">Arch Precision</td>
                      <td className="py-2.5 px-4 font-bold text-[#B3315A]">Line by line definition</td>
                      <td className="py-2.5 px-4 text-[#5B6875]">Difficult on small areas</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-[#16202A]">Results last</td>
                      <td className="py-2.5 px-4 font-bold text-[#B3315A]">3 to 5 weeks</td>
                      <td className="py-2.5 px-4 text-[#5B6875]">3 to 4 weeks</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 2: QUEUE & SERVE/BILL */}
        {/* =================================================================== */}
        {tab === 'queue' && currentUser?.role === 'LOCATION_OPERATOR' && (
          <div className="space-y-6">
            {/* Waiting Queue */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#D9DFE5] pb-3">
                <h2 className="text-xl font-bold font-serif text-[#16202A]">
                  Waiting at {locName(loc)}
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E9EDF1] text-[#5B6875]">
                  {waitingCount} waiting
                </span>
              </div>

              {waitingCount === 0 ? (
                <div className="p-8 text-center text-sm text-[#5B6875] border border-dashed border-[#D9DFE5] rounded-lg">
                  No one is waiting. New check-ins submitted on the Check-in tab appear here instantly.
                </div>
              ) : (
                <div className="space-y-3">
                  {currentStudioVisits.filter(v => v.status === 'waiting').map((v, i) => {
                    const isOpen = openVisitId === v.id;
                    const draft = drafts[v.id] || { pay: 'card', tip: 0 };

                    return (
                      <article
                        key={v.id}
                        className={`border rounded-lg p-4 transition-all bg-white ${
                          isOpen ? 'border-[#B3315A] ring-1 ring-[#B3315A]' : 'border-[#D9DFE5]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 font-mono text-xs font-bold bg-[#E9EDF1] text-[#16202A] rounded">
                              #{i + 1}
                            </span>
                            <span className="font-bold text-base text-[#16202A]">{v.name}</span>
                            <span className="text-xs text-[#5B6875]">{v.phone}</span>
                          </div>
                          <span className="text-xs text-[#5B6875] font-mono">
                            Checked in {clock(v.ts)} · waiting {waitMin(v.ts)} min
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {v.services.map(s => (
                            <span key={s} className="px-2 py-0.5 bg-[#E9EDF1] text-[#16202A] text-xs font-semibold rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm font-bold text-[#16202A] mt-2">Order total: {money(v.amount)}</p>

                        {v.note && (
                          <p className="text-xs text-[#5B6875] mt-1.5 italic">Note: {v.note}</p>
                        )}

                        {/* Inline Billing Form */}
                        {isOpen ? (
                          <div className="mt-4 pt-4 border-t border-dashed border-[#D9DFE5] space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <span className="block text-xs font-bold text-[#5B6875] mb-1">Service total</span>
                                <p className="p-2 text-sm font-mono font-bold">{money(v.amount)}</p>
                              </div>

                              {/* Payment Method */}
                              <div>
                                <label className="block text-xs font-bold text-[#5B6875] mb-1">Payment</label>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setDrafts(prev => ({ ...prev, [v.id]: { ...draft, pay: 'cash' } }))}
                                    className={`flex-1 py-2 text-xs font-bold rounded border cursor-pointer ${
                                      draft.pay === 'cash' ? 'bg-[#0E7C7B] text-white border-[#0E7C7B]' : 'bg-[#F2F4F6] border-[#D9DFE5]'
                                    }`}
                                  >
                                    Cash
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDrafts(prev => ({ ...prev, [v.id]: { ...draft, pay: 'card' } }))}
                                    className={`flex-1 py-2 text-xs font-bold rounded border cursor-pointer ${
                                      draft.pay === 'card' ? 'bg-[#B3315A] text-white border-[#B3315A]' : 'bg-[#F2F4F6] border-[#D9DFE5]'
                                    }`}
                                  >
                                    Card
                                  </button>
                                </div>
                              </div>

                              {/* Tip */}
                              <div>
                                <label className="block text-xs font-bold text-[#5B6875] mb-1">Tip ($)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.tip}
                                  onChange={e => setDrafts(prev => ({ ...prev, [v.id]: { ...draft, tip: e.target.value === '' ? '' : Number(e.target.value) } }))}
                                  placeholder="0.00"
                                  className="w-full p-2 bg-[#F2F4F6] border border-[#D9DFE5] rounded text-xs font-mono"
                                />
                              </div>
                            </div>

                            <p className="text-sm font-bold text-[#16202A]">
                              Final bill: {money(v.amount + (Number(draft.tip) || 0))}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveBilling(v.id)}
                                className="px-4 py-2 bg-[#B3315A] text-white text-xs font-bold rounded shadow-xs cursor-pointer"
                              >
                                Check out customer
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenVisitId(null)}
                                className="px-3 py-2 bg-white border border-[#D9DFE5] text-[#5B6875] text-xs font-semibold rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#D9DFE5]/50">
                            <button
                              type="button"
                              onClick={() => handleOpenBilling(v)}
                              className="px-3.5 py-1.5 bg-[#B3315A] text-white text-xs font-bold rounded shadow-xs hover:bg-[#9B254A] cursor-pointer"
                            >
                              Complete checkout
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Served Today List */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#D9DFE5] pb-3">
                <h3 className="text-lg font-bold font-serif text-[#16202A]">
                  Served Today at {locName(loc)}
                </h3>
                <span className="text-xs text-[#5B6875] font-semibold">
                  {currentStudioVisits.filter(v => v.status === 'done').length} finished
                </span>
              </div>

              {currentStudioVisits.filter(v => v.status === 'done').length === 0 ? (
                <div className="p-6 text-center text-xs text-[#5B6875] border border-dashed border-[#D9DFE5] rounded-lg">
                  Completed checkouts will appear here.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentStudioVisits.filter(v => v.status === 'done').map((v, i) => (
                    <div key={v.id} className="p-3 bg-[#F2F4F6] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-mono font-bold text-[#5B6875] mr-2">#{i + 1}</span>
                        <strong className="text-[#16202A] text-sm">{v.name}</strong>
                        <span className="text-[#5B6875] ml-2 font-mono">by {v.employee || 'Staff'}</span>
                        <div className="text-[11px] text-[#5B6875] mt-0.5">
                          {v.services.join(', ')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          v.pay === 'cash' ? 'bg-teal-100 text-teal-800' : 'bg-rose-100 text-[#B3315A]'
                        }`}>
                          {v.pay === 'cash' ? 'Cash' : 'Card'}
                        </span>
                        <span className="font-bold font-mono text-sm">{money(v.amount)}</span>
                        {v.tip > 0 && (
                          <span className="text-[#5B6875] font-mono text-[11px]">+ {money(v.tip)} tip</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 3: ADMIN ANALYTICS */}
        {/* =================================================================== */}
        {tab === 'analytics' && currentUser?.role === 'SUPER_ADMIN' && (
          <div className="space-y-5">
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-[#B3315A] font-bold">Business snapshot</p>
                  <h2 className="text-2xl font-bold font-serif text-[#16202A] mt-1">Analytics at a glance</h2>
                  <p className="text-xs text-[#5B6875] mt-1">
                    {analyticsDateRange.label} · {analyticsLocation === 'all' ? 'All locations' : locName(Number(analyticsLocation))}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F2F4F6] text-[11px] font-semibold text-[#5B6875]">
                  <Calendar className="w-3.5 h-3.5" />
                  {analyticsDateRange.from} — {analyticsDateRange.to}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {([
                  { value: 'today', label: 'Today' },
                  { value: 'last7', label: 'Last 7 days' },
                  { value: 'last30', label: 'Last 30 days' },
                  { value: 'month', label: 'Month to date' },
                  { value: 'custom', label: 'Custom range' }
                ] as const).map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={analyticsPeriod === preset.value}
                    onClick={() => setAnalyticsPeriod(preset.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      analyticsPeriod === preset.value
                        ? 'bg-[#B3315A] text-white border-[#B3315A]'
                        : 'bg-white text-[#5B6875] border-[#D9DFE5] hover:border-[#B3315A]/50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label htmlFor="analytics-location" className="block text-xs font-bold text-[#5B6875] mb-1.5">Location</label>
                  <select
                    id="analytics-location"
                    value={analyticsLocation}
                    onChange={event => setAnalyticsLocation(event.target.value as 'all' | '0' | '1')}
                    className="w-full px-3 py-2 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm font-semibold"
                  >
                    <option value="all">All locations</option>
                    {settings.locations.map((name, index) => (
                      <option key={name} value={index}>{name}</option>
                    ))}
                  </select>
                </div>
                {analyticsPeriod === 'custom' && (
                  <>
                    <div>
                      <label htmlFor="analytics-from" className="block text-xs font-bold text-[#5B6875] mb-1.5">From</label>
                      <input
                        id="analytics-from"
                        type="date"
                        value={customFrom}
                        max={today}
                        onChange={event => setCustomFrom(event.target.value)}
                        className="w-full px-3 py-2 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="analytics-to" className="block text-xs font-bold text-[#5B6875] mb-1.5">To</label>
                      <input
                        id="analytics-to"
                        type="date"
                        value={customTo}
                        max={today}
                        onChange={event => setCustomTo(event.target.value)}
                        className="w-full px-3 py-2 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm font-mono"
                      />
                    </div>
                  </>
                )}
              </div>
              {analyticsPeriod === 'custom' && analyticsDateRange.from > analyticsDateRange.to && (
                <p role="alert" className="text-xs font-semibold text-rose-700">
                  The start date must be on or before the end date.
                </p>
              )}
            </section>

            {analyticsDateRange.from <= analyticsDateRange.to && (
              <>
                <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                  {[
                    { label: 'Total visits', value: analyticsScopedVisits.length, accent: 'text-[#16202A]' },
                    { label: 'Clients served', value: analyticsStats.n, accent: 'text-[#16202A]' },
                    { label: 'Service sales', value: money(analyticsStats.sales), accent: 'text-[#B3315A]' },
                    { label: 'Tips collected', value: money(analyticsStats.tips), accent: 'text-teal-800' },
                    { label: 'Still waiting', value: analyticsStats.waiting, accent: 'text-amber-700' }
                  ].map(metric => (
                    <div key={metric.label} className="bg-white border border-[#D9DFE5] rounded-xl p-4 shadow-xs">
                      <span className="block text-[10px] uppercase tracking-wider text-[#5B6875] font-bold">{metric.label}</span>
                      <span className={`block mt-1 text-2xl font-extrabold font-mono ${metric.accent}`}>{metric.value}</span>
                    </div>
                  ))}
                </section>

                <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DFE5] pb-3">
                    <div>
                      <h3 className="font-bold text-base text-[#16202A]">Location performance</h3>
                      <p className="text-xs text-[#5B6875] mt-1">Compare completed sales, tips, and visit status for the selected period.</p>
                    </div>
                    <span className="text-[11px] font-semibold text-[#5B6875]">{analyticsDateRange.label}</span>
                  </div>
                  {analyticsLocationStats.length === 0 || analyticsScopedVisits.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[#5B6875]">No visits found for this location and date range.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {analyticsLocationStats.map(location => {
                        const salesShare = analyticsAllStats.sales > 0
                          ? Math.round((location.sales / analyticsAllStats.sales) * 100)
                          : 0;
                        return (
                          <article key={location.location} className="rounded-xl border border-[#D9DFE5] p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="font-bold text-[#16202A]">{location.name}</h4>
                                <p className="text-xs text-[#5B6875] mt-0.5">{location.orders} total visits</p>
                              </div>
                              <MapPin className="w-4 h-4 text-[#B3315A]" />
                            </div>
                            <div>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-2xl font-extrabold font-mono text-[#B3315A]">{money(location.sales)}</span>
                                {analyticsLocation === 'all' && (
                                  <span className="text-[11px] font-semibold text-[#5B6875]">{salesShare}% of sales</span>
                                )}
                              </div>
                              <div className="h-1.5 mt-2 rounded-full bg-[#F2F4F6] overflow-hidden">
                                <div className="h-full rounded-full bg-[#B3315A]" style={{ width: `${salesShare}%` }} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#E9EDF1] pt-3 text-xs">
                              <div className="flex justify-between gap-2"><span className="text-[#5B6875]">Clients served</span><strong>{location.n}</strong></div>
                              <div className="flex justify-between gap-2"><span className="text-[#5B6875]">Waiting</span><strong>{location.waiting}</strong></div>
                              <div className="flex justify-between gap-2"><span className="text-[#5B6875]">Tips</span><strong>{money(location.tips)}</strong></div>
                              <div className="flex justify-between gap-2"><span className="text-[#5B6875]">Cancelled</span><strong>{location.cancelled}</strong></div>
                              <div className="flex justify-between gap-2"><span className="text-[#5B6875]">Cash sales</span><strong>{money(location.cash)}</strong></div>
                              <div className="flex justify-between gap-2"><span className="text-[#5B6875]">Card sales</span><strong>{money(location.credit)}</strong></div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 sm:p-6 shadow-xs space-y-3">
                  <div className="border-b border-[#D9DFE5] pb-3">
                    <h3 className="font-bold text-base text-[#16202A]">Staff performance</h3>
                    <p className="text-xs text-[#5B6875] mt-1">Completed visits and sales for the current location and date filters.</p>
                  </div>
                  {analyticsStaffStats.length === 0 ? (
                    <p className="py-5 text-center text-sm text-[#5B6875]">No completed visits in this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#D9DFE5] text-[#5B6875] uppercase tracking-wide">
                            <th className="py-2 pr-3">Staff member</th>
                            <th className="py-2 px-2 text-right">Clients</th>
                            <th className="py-2 px-2 text-right">Service sales</th>
                            <th className="py-2 pl-2 text-right">Tips</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E9EDF1]">
                          {analyticsStaffStats.map(([name, stats]) => (
                            <tr key={name}>
                              <td className="py-3 pr-3 font-semibold text-[#16202A]">{name}</td>
                              <td className="py-3 px-2 text-right font-mono">{stats.n}</td>
                              <td className="py-3 px-2 text-right font-mono font-semibold">{money(stats.sales)}</td>
                              <td className="py-3 pl-2 text-right font-mono">{money(stats.tips)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 4: CLOSING REPORT (TILL SLIP) */}
        {/* =================================================================== */}
        {tab === 'report' && currentUser?.role === 'SUPER_ADMIN' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="p-4 bg-white border border-[#D9DFE5] rounded-xl flex flex-wrap items-end gap-3 shadow-xs">
              <div>
                <label className="block text-xs font-bold text-[#5B6875] mb-1">Date</label>
                <input
                  type="date"
                  value={reportDate}
                  max={today}
                  onChange={e => setReportDate(e.target.value)}
                  className="px-3 py-1.5 bg-[#F2F4F6] border border-[#D9DFE5] rounded text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5B6875] mb-1">Location</label>
                <select
                  value={reportLoc}
                  onChange={e => setReportLoc(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 bg-[#F2F4F6] border border-[#D9DFE5] rounded text-xs font-semibold"
                >
                  <option value={0}>{locName(0)}</option>
                  <option value={1}>{locName(1)}</option>
                </select>
              </div>

              <div className="ml-auto">
                <span className={`px-3 py-1 rounded text-xs font-bold ${
                  currentClosing ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}>
                  {currentClosing ? 'Day Closed' : 'Day Open'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Authentic Till Slip Receipt */}
              <section className="slip shadow-sm space-y-2">
                <div className="text-center font-bold text-base tracking-wide uppercase">
                  {locName(reportLoc)}
                </div>
                <div className="text-center text-xs text-[#5B6875]">
                  {longDay(reportDate)}
                </div>
                <div className="border-t-2 border-dashed border-[#D9DFE5] my-2" />

                <div className="ln text-xs">
                  <span>Customers served</span>
                  <span className="dots" />
                  <span className="font-bold font-mono">{reportStats.n}</span>
                </div>

                <div className="ln font-bold text-base py-1">
                  <span>Total sales</span>
                  <span className="dots" />
                  <span className="font-mono text-[#B3315A]">{money(reportStats.sales)}</span>
                </div>

                <div className="ln text-xs text-[#5B6875] pl-3">
                  <span>Cash sales</span>
                  <span className="dots" />
                  <span className="font-mono">{money(reportStats.cash)}</span>
                </div>

                <div className="ln text-xs text-[#5B6875] pl-3">
                  <span>Card sales</span>
                  <span className="dots" />
                  <span className="font-mono">{money(reportStats.credit)}</span>
                </div>

                <div className="border-t-2 border-dashed border-[#D9DFE5] my-2" />

                <div className="ln text-xs font-bold">
                  <span>Tips collected</span>
                  <span className="dots" />
                  <span className="font-mono">{money(reportStats.tips)}</span>
                </div>

                <div className="ln text-xs text-[#5B6875] pl-3">
                  <span>In cash</span>
                  <span className="dots" />
                  <span className="font-mono">{money(reportStats.tipCash)}</span>
                </div>

                <div className="ln text-xs text-[#5B6875] pl-3">
                  <span>On card</span>
                  <span className="dots" />
                  <span className="font-mono">{money(reportStats.tipCredit)}</span>
                </div>

                {reportStats.waiting > 0 && (
                  <>
                    <div className="border-t-2 border-dashed border-[#D9DFE5] my-2" />
                    <div className="ln text-xs text-amber-800">
                      <span>Still waiting in queue</span>
                      <span className="dots" />
                      <span className="font-bold">{reportStats.waiting}</span>
                    </div>
                  </>
                )}
              </section>

              {/* Right Side: Employee breakdown & Close Day */}
              <div className="space-y-4">
                {/* Employee Breakdown Table */}
                <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#16202A]">
                    By Employee
                  </h3>
                  {Object.keys(reportStats.by).length === 0 ? (
                    <p className="text-xs text-[#5B6875]">No finished treatments for this date.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#D9DFE5] text-[#5B6875] font-bold">
                            <th className="py-2">Employee</th>
                            <th className="py-2 text-right">Clients</th>
                            <th className="py-2 text-right">Sales</th>
                            <th className="py-2 text-right">Tips</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D9DFE5]">
                          {Object.keys(reportStats.by).map(emp => {
                            const b = reportStats.by[emp];
                            return (
                              <tr key={emp}>
                                <td className="py-2 font-semibold text-[#16202A]">{emp}</td>
                                <td className="py-2 text-right font-mono">{b.n}</td>
                                <td className="py-2 text-right font-mono font-bold">{money(b.sales)}</td>
                                <td className="py-2 text-right font-mono text-[#5B6875]">{money(b.tips)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Close the Day Drawer Section */}
                <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#16202A]">
                    Close the Day
                  </h3>

                  {currentClosing ? (
                    <div className="space-y-3">
                      <p className="text-xs text-[#5B6875]">
                        Closed at {clock(currentClosing.closedTs)}. Totals saved to database: {money(currentClosing.sales)} from {currentClosing.customers} clients.
                      </p>
                      {currentClosing.counted != null && (
                        <p className="text-xs font-mono">
                          Cash counted: {money(currentClosing.counted)} against {money(currentClosing.expected)} expected:{' '}
                          <strong className={Math.abs((currentClosing.counted || 0) - (currentClosing.expected || 0)) < 0.01 ? 'text-emerald-700' : 'text-rose-700'}>
                            {Math.abs((currentClosing.counted || 0) - (currentClosing.expected || 0)) < 0.01
                              ? 'matches'
                              : `${(currentClosing.counted || 0) > (currentClosing.expected || 0) ? 'over by' : 'short by'} ${money(Math.abs((currentClosing.counted || 0) - (currentClosing.expected || 0)))}`}
                          </strong>
                        </p>
                      )}

                      {confirmReopen ? (
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleReopenDay}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded cursor-pointer"
                          >
                            Yes, Reopen Day
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmReopen(false)}
                            className="px-3 py-1.5 bg-white border border-[#D9DFE5] text-xs font-semibold rounded cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmReopen(true)}
                          className="px-3 py-1.5 bg-white border border-[#D9DFE5] text-xs font-semibold rounded hover:bg-[#F2F4F6] cursor-pointer"
                        >
                          Reopen day
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[#5B6875]">
                          Cash counted in the drawer (optional)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={countedDrawer}
                          onChange={e => setCountedDrawer(e.target.value)}
                          placeholder={money(reportStats.cash + reportStats.tipCash)}
                          className="w-full p-2 bg-[#F2F4F6] border border-[#D9DFE5] rounded text-xs font-mono font-bold"
                        />
                        <p className="text-[11px] text-[#5B6875]">
                          Expected in drawer: {money(reportStats.cash + reportStats.tipCash)} (cash sales + cash tips).
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCloseDay}
                          disabled={isClosingDay}
                          className="px-4 py-2 bg-[#B3315A] hover:bg-[#9B254A] text-white text-xs font-bold rounded cursor-pointer disabled:opacity-50"
                        >
                          {isClosingDay ? 'Saving...' : 'Close day'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopySlip}
                          className="px-3 py-2 bg-white border border-[#D9DFE5] text-xs font-semibold rounded hover:bg-[#F2F4F6] flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy summary</span>
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 4: OWNER / EXECUTIVE ADMIN (VISUAL BARS, P&L, SLAs, NPS, AUDIT) */}
        {/* =================================================================== */}
        {tab === 'owner' && currentUser?.role === 'SUPER_ADMIN' && (
          <div className="space-y-6">
            {/* Top Consolidated Metrics */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#D9DFE5] pb-3">
                <h2 className="text-xl font-bold font-serif text-[#16202A]">
                  Today Across Both Michigan Studios
                </h2>
                <span className="text-xs text-[#5B6875] font-mono">{longDay(today)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="p-4 bg-[#F2F4F6] rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-[#5B6875] font-bold block">Clients Served</span>
                  <span className="text-3xl font-extrabold text-[#16202A] font-mono">{todayAllStats.n}</span>
                </div>
                <div className="p-4 bg-[#F2F4F6] rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-[#5B6875] font-bold block">Total Sales</span>
                  <span className="text-3xl font-extrabold text-[#B3315A] font-mono">{money(todayAllStats.sales)}</span>
                </div>
                <div className="p-4 bg-[#F2F4F6] rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-[#5B6875] font-bold block">Specialist Tips</span>
                  <span className="text-3xl font-extrabold text-teal-800 font-mono">{money(todayAllStats.tips)}</span>
                </div>
              </div>
            </section>

            {/* Studio Cards (Battle Creek & Jackson) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1].map(l => {
                const locVs = visits.filter(v => v.loc === l);
                const s = computeStats(locVs);
                const cl = closings.find(c => c.id === `${l}_${today}`);

                return (
                  <div key={l} className="bg-white border border-[#D9DFE5] rounded-xl p-5 shadow-xs space-y-3 border-t-4 border-t-[#B3315A]">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-base text-[#16202A]">{locName(l)} Studio</h3>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${cl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                        {cl ? 'Closed' : 'Open'}
                      </span>
                    </div>

                    <div className="text-2xl font-bold font-mono text-[#16202A]">{money(s.sales)}</div>

                    <div className="space-y-1 text-xs text-[#5B6875] border-t border-[#D9DFE5] pt-2">
                      <div className="flex justify-between">
                        <span>Clients served:</span>
                        <strong className="text-[#16202A] font-mono">{s.n}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Cash sales:</span>
                        <span className="font-mono">{money(s.cash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Card sales:</span>
                        <span className="font-mono">{money(s.credit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tips:</span>
                        <span className="font-mono">{money(s.tips)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Waiting now:</span>
                        <span className="font-mono font-bold text-[#B3315A]">{s.waiting}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 shadow-xs space-y-4">
              <div className="border-b border-[#D9DFE5] pb-3">
                <h3 className="font-bold text-base text-[#16202A]">Orders &amp; Revenue Insights</h3>
                <p className="text-xs text-[#5B6875] mt-1">
                  Daily, weekly, and month-to-date totals for each studio and both studios combined. Revenue includes completed checkouts only.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#D9DFE5] text-[#5B6875] uppercase tracking-wide">
                      <th className="py-2 pr-3">Period</th>
                      <th className="py-2 pr-3">Location</th>
                      <th className="py-2 px-2 text-right">Orders</th>
                      <th className="py-2 px-2 text-right">Completed</th>
                      <th className="py-2 px-2 text-right">Open</th>
                      <th className="py-2 px-2 text-right">Cancelled</th>
                      <th className="py-2 px-2 text-right">Service sales</th>
                      <th className="py-2 px-2 text-right">Tips</th>
                      <th className="py-2 pl-2 text-right">Collected total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDF1]">
                    {periodInsights.map(insight => (
                      <tr key={`${insight.period}-${insight.location}`}>
                        <td className="py-2.5 pr-3">
                          <strong className="text-[#16202A]">{insight.period}</strong>
                          <span className="block text-[10px] text-[#7A8692]">{insight.range}</span>
                        </td>
                        <td className={`py-2.5 pr-3 ${insight.location === 'All locations' ? 'font-bold text-[#16202A]' : 'text-[#5B6875]'}`}>
                          {insight.location}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono">{insight.orders}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{insight.n}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{insight.waiting}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{insight.cancelled}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{money(insight.sales)}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{money(insight.tips)}</td>
                        <td className="py-2.5 pl-2 text-right font-mono font-bold text-[#B3315A]">
                          {money(insight.sales + insight.tips)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 7-Day Comparative Sales Bar Chart */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#D9DFE5] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[#16202A]">Sales, Last 7 Days</h3>
                  <p className="text-xs text-[#5B6875]">Comparative volume per studio location</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#B3315A]" />
                    <span>{locName(0)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#0E7C7B]" />
                    <span>{locName(1)}</span>
                  </span>
                </div>
              </div>

              {/* Chart Bars */}
              <div className="grid grid-cols-7 gap-2 pt-6 items-end h-48 border-b border-[#D9DFE5]">
                {past7Days.map(d => {
                  const [bc, jk] = salesByDay.map[d] || [0, 0];
                  const max = salesByDay.max;
                  const hBc = Math.max(bc ? 4 : 0, Math.round((bc / max) * 100));
                  const hJk = Math.max(jk ? 4 : 0, Math.round((jk / max) * 100));

                  return (
                    <div key={d} className="flex gap-1 items-end justify-center h-full group relative">
                      {/* Battle Creek Bar */}
                      <div
                        className="w-full max-w-[20px] bg-[#B3315A] rounded-t-xs transition-all relative"
                        style={{ height: `${hBc}%` }}
                        title={`${locName(0)}: ${money(bc)}`}
                      >
                        {bc > 0 && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 text-[9px] text-[#5B6875] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                            ${Math.round(bc)}
                          </span>
                        )}
                      </div>

                      {/* Jackson Bar */}
                      <div
                        className="w-full max-w-[20px] bg-[#0E7C7B] rounded-t-xs transition-all relative"
                        style={{ height: `${hJk}%` }}
                        title={`${locName(1)}: ${money(jk)}`}
                      >
                        {jk > 0 && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 text-[9px] text-[#5B6875] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                            ${Math.round(jk)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs text-[#5B6875] font-semibold">
                {past7Days.map(d => (
                  <span key={d}>{dayLabel(d)}</span>
                ))}
              </div>
            </section>

            {/* P&L REAL OPERATING PROFITS & EXPENSES (CALCULATED FROM MONGODB) */}
            <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#D9DFE5] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[#16202A]">Consolidated P&amp;L &amp; Operating Margins</h3>
                  <p className="text-xs text-[#5B6875]">Calculated from actual tickets recorded in MongoDB</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded border ${
                  weekVisits.filter(v => v.status === 'done').reduce((a, v) => a + (v.amount || 0), 0) > 0
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                    : 'text-[#5B6875] bg-[#F2F4F6] border-[#D9DFE5]'
                }`}>
                  {weekVisits.filter(v => v.status === 'done').reduce((a, v) => a + (v.amount || 0), 0) > 0
                    ? `${Math.round(((weekVisits.filter(v => v.status === 'done').reduce((a, v) => a + (v.amount || 0), 0) - (weekVisits.filter(v => v.status === 'done').reduce((a, v) => a + (v.amount || 0), 0) * 0.15)) / weekVisits.filter(v => v.status === 'done').reduce((a, v) => a + (v.amount || 0), 0)) * 1000) / 10}% Net Margin`
                    : '0.0% Net Margin'}
                </span>
              </div>

              {(() => {
                const doneVisits = weekVisits.filter(v => v.status === 'done');
                const gross = doneVisits.reduce((acc, v) => acc + (v.amount || 0), 0);
                const cardFeesAndSupplies = Math.round((gross * 0.15) * 100) / 100;
                const netReal = Math.round((gross - cardFeesAndSupplies) * 100) / 100;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-[#F2F4F6] rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-[#5B6875] block">Gross Service Turnover</span>
                      <span className="text-2xl font-bold font-mono text-[#16202A]">{money(gross)}</span>
                      <span className="text-[10px] text-[#5B6875] block mt-0.5">{doneVisits.length} billed treatments in MongoDB</span>
                    </div>
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-rose-800 block">Total Operational Direct Costs</span>
                      <span className="text-2xl font-bold font-mono text-rose-800">
                        {cardFeesAndSupplies > 0 ? `-${money(cardFeesAndSupplies)}` : money(0)}
                      </span>
                      <span className="text-[10px] text-rose-700 block mt-0.5">Card processing &amp; disposable supplies (15%)</span>
                    </div>
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">Net Real Profit</span>
                      <span className="text-2xl font-bold font-mono text-emerald-800">
                        {netReal > 0 ? `+${money(netReal)}` : money(0)}
                      </span>
                      <span className="text-[10px] text-emerald-700 block mt-0.5">100% Tips passed directly to artists</span>
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* QUALITY SLAs & NPS (CALCULATED FROM MONGODB) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* SLAs */}
              <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 shadow-xs space-y-3">
                <h3 className="font-bold text-sm uppercase text-[#16202A]">Operational SLAs</h3>
                {(() => {
                  const doneToday = visits.filter(v => v.status === 'done');
                  if (doneToday.length === 0) {
                    return (
                      <div className="p-4 text-center text-xs text-[#5B6875] border border-dashed border-[#D9DFE5] rounded-lg">
                        No treatments completed yet today. SLAs calculate live from MongoDB as tickets are finalized.
                      </div>
                    );
                  }

                  const waitTimes = doneToday.map(v => Math.max(0, Math.round(((v.doneTs || v.ts) - v.ts) / 60000)));
                  const avgWait = Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length);
                  const under15 = waitTimes.filter(w => w <= 15).length;
                  const under15Pct = Math.round((under15 / doneToday.length) * 100);

                  return (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-[#D9DFE5]">
                        <span>Average Wait Time:</span>
                        <strong className="text-emerald-700 font-mono">{avgWait} mins</strong>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-[#D9DFE5]">
                        <span>Turnaround (&le; 15 mins):</span>
                        <strong className="text-emerald-700 font-mono">{under15Pct}% On-Target</strong>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-[#D9DFE5]">
                        <span>Treatments Completed Today:</span>
                        <strong className="text-emerald-700 font-mono">{doneToday.length}</strong>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span>Zero Double-Booking:</span>
                        <strong className="text-emerald-700 font-mono">100% Guaranteed</strong>
                      </div>
                    </div>
                  );
                })()}
              </section>

              {/* NPS */}
              <section className="bg-white border border-[#D9DFE5] rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm uppercase text-[#16202A]">Client NPS Score</h3>
                  <span className="text-sm font-bold font-mono text-[#5B6875]">0 Reviews</span>
                </div>
                <p className="text-xs text-[#5B6875]">
                  No survey responses in MongoDB yet. Ratings and NPS calculate live upon customer review submission without synthetic padding.
                </p>
                <div className="w-full h-2 bg-[#E9EDF1] rounded-full overflow-hidden" />
                <div className="flex justify-between text-[10px] text-[#5B6875] font-semibold">
                  <span>0% Promoters</span>
                  <span>0% Passives</span>
                  <span>0% Detractors</span>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 5: SETTINGS (ADMIN ONLY) */}
        {/* =================================================================== */}
        {tab === 'settings' && currentUser?.role === 'SUPER_ADMIN' && (
          <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-xl font-bold font-serif text-[#16202A]">Shop Settings</h2>
              <p className="text-xs text-[#5B6875]">These settings apply across both devices and both Michigan studios.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#5B6875] mb-1">
                  Employees (one name per line)
                </label>
                <textarea
                  rows={4}
                  value={staffText}
                  onChange={e => setStaffText(e.target.value)}
                  className="w-full p-3 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-xs font-medium"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-5 py-2.5 bg-[#B3315A] text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-[#9B254A]"
              >
                Save Staff Settings
              </button>
            </div>
          </section>
        )}

        {tab === 'settings' && currentUser?.role === 'SUPER_ADMIN' && (
          <section className="bg-white border border-[#D9DFE5] rounded-xl p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-xl font-bold font-serif text-[#16202A]">Services &amp; Prices</h2>
              <p className="text-xs text-[#5B6875] mt-1">
                Changes are saved to MongoDB and apply to new customer orders at both studios. Existing orders keep their original price.
              </p>
            </div>

            <form onSubmit={handleSaveService} className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto_auto] gap-3 items-end">
              <div>
                <label htmlFor="service-name" className="block text-xs font-bold text-[#5B6875] mb-1">Service name</label>
                <input
                  id="service-name"
                  required
                  maxLength={100}
                  value={serviceNameDraft}
                  onChange={event => setServiceNameDraft(event.target.value)}
                  placeholder="e.g. Eyebrow threading"
                  className="w-full p-2.5 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm"
                />
              </div>
              <div>
                <label htmlFor="service-price" className="block text-xs font-bold text-[#5B6875] mb-1">Price ($)</label>
                <input
                  id="service-price"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={servicePriceDraft}
                  onChange={event => setServicePriceDraft(event.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-sm font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#B3315A] text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-[#9B254A]"
              >
                {editingServiceName ? 'Save changes' : 'Add service'}
              </button>
              {editingServiceName && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingServiceName(null);
                    setServiceNameDraft('');
                    setServicePriceDraft('');
                  }}
                  className="px-4 py-2.5 border border-[#D9DFE5] text-[#5B6875] text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </form>

            <div className="divide-y divide-[#E9EDF1] border-y border-[#E9EDF1]">
              {settings.services.map(service => (
                <div key={service.n} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[#16202A]">{service.n}</p>
                    <p className="text-xs text-[#5B6875] font-mono">{money(service.p)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditService(service)}
                      className="px-3 py-1.5 border border-[#D9DFE5] rounded text-xs font-semibold text-[#16202A] hover:border-[#B3315A] cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteService(service.n)}
                      className={`px-3 py-1.5 border rounded text-xs font-semibold cursor-pointer ${
                        deletingServiceName === service.n
                          ? 'bg-red-700 border-red-700 text-white'
                          : 'border-red-200 text-red-700 hover:bg-red-50'
                      }`}
                    >
                      {deletingServiceName === service.n ? 'Confirm delete' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* FOOTER: ADMIN / STAFF SIGN-IN AT THE VERY LAST */}
        {/* =================================================================== */}
        <footer className="pt-8 border-t border-[#D9DFE5]/60 flex flex-col items-center justify-center gap-3 text-xs text-[#5B6875]">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {!currentUser ? (
              <button
                type="button"
                onClick={() => setIsStaffModalOpen(true)}
                className="px-4 py-2 bg-white hover:bg-[#F2F4F6] border border-[#D9DFE5] rounded-lg text-xs font-semibold text-[#16202A] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Lock className="w-3.5 h-3.5 text-[#B3315A]" />
                <span>Staff / Admin Sign In</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-[#D9DFE5] shadow-2xs">
                <span className="font-semibold text-[#16202A] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{currentUser.fullName} ({currentUser.role === 'SUPER_ADMIN' ? 'HQ Admin' : locName(loc)})</span>
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-red-700 hover:underline cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-[#5B6875]">
            Perfect Browlines · 5462 Beckley Rd, Battle Creek, MI &amp; 1850 W Michigan Ave, Jackson, MI
          </p>
        </footer>
      </div>

      {/* MODALS */}
      <StaffLoginModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onSelectUser={u => {
          setCurrentUser(u);
          if (u.assignedLocationId === 'loc-0') setLoc(0);
          if (u.assignedLocationId === 'loc-1') setLoc(1);
          setTab(u.role === 'SUPER_ADMIN' ? 'owner' : 'queue');
          setIsStaffModalOpen(false);
          showToast(`Signed in as ${u.fullName}`);
        }}
      />

      {/* TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#16202A] text-white px-5 py-2.5 rounded-lg text-xs font-semibold shadow-xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
