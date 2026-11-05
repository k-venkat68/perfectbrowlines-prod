export type UserRole = 'SUPER_ADMIN' | 'LOCATION_OPERATOR' | 'CUSTOMER';

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

export type PaymentMethodType = 'CASH' | 'CARD' | 'GATEWAY' | 'SPLIT';
export type PaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

export interface VisitItem {
  id: string;
  loc: number; // 0 = Battle Creek, 1 = Jackson
  date: string; // YYYY-MM-DD
  name: string;
  phone: string;
  services: string[];
  note: string;
  status: 'waiting' | 'done' | 'cancelled';
  amount: number;
  pay: 'cash' | 'card' | 'credit' | '';
  tip: number;
  employee: string;
  ts: number;
  doneTs?: number;
}

export interface ClosingRecord {
  id: string;
  loc: number;
  date: string;
  customers: number;
  sales: number;
  cash: number;
  credit: number;
  tips: number;
  tipCash: number;
  tipCredit: number;
  expected: number;
  counted?: number | null;
  closedTs: number;
}

export interface ShopSettings {
  locations: string[];
  currency: string;
  staff: string[];
  services: Array<{ n: string; p: number; locationPrices?: Record<string, number> }>;
}

export interface OperatorCompensation {
  email: string;
  fullName: string;
  loc: number;
  monthlySalary: number;
}

export interface ServiceSnapshot {
  serviceId: string;
  name: string;
  description?: string;
  priceMinor: number; // Integer in minor units (e.g. 850000 = ₹8,500.00)
  durationMinutes: number;
  bufferTimeMinutes: number;
  taxRateBasisPoints: number; // e.g., 1800 = 18.00%
}

export interface SplitPaymentRecord {
  method: 'CASH' | 'CARD' | 'GATEWAY';
  amountMinor: number;
  referenceId?: string;
  processedAt: string; // ISO string
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  logoUrl: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  invoicePrefix: string;
  taxId?: string;
  isActive: boolean;
}

export interface LocationOpeningHour {
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  openTime: string;  // "09:00"
  closeTime: string; // "20:00"
  isOpen: boolean;
}

export interface SalonLocation {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  coordinates?: { latitude: number; longitude: number };
  contactNumber: string;
  email: string;
  openingHours: LocationOpeningHour[];
  holidays: string[];
  timezone: string;
  isActive: boolean;
}

export interface SalonUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  assignedLocationId?: string;
  fullName: string;
  phone: string;
  isActive: boolean;
}

export interface ServiceCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface SalonService {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  durationMinutes: number;
  bufferTimeMinutes: number;
  basePriceMinor: number;
  locationPriceOverrides: Array<{
    locationId: string;
    priceMinor: number;
  }>;
  taxRateBasisPoints: number;
  availableLocationIds: string[];
  isActive: boolean;
}

export interface BookingCustomer {
  fullName: string;
  phone: string;
  email: string;
  notes?: string;
}

export interface Booking {
  id: string;
  tenantId: string;
  locationId: string;
  bookingReference: string;
  idempotencyKey?: string;
  customer: BookingCustomer;
  serviceSnapshots: ServiceSnapshot[];
  totalDurationMinutes: number;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: BookingStatus;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  operatorId?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  locationId: string;
  bookingId: string;
  orderNumber: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number; // Gross service revenue + tax - discount (EXCLUDES TIP)
  tipMinor: number;   // Isolated tip from service revenue
  paidAmountMinor: number;
  outstandingBalanceMinor: number;
  paymentStatus: PaymentStatus;
  splits: SplitPaymentRecord[];
  completedAt: string;
}

export interface DailyClosing {
  id: string;
  tenantId: string;
  locationId: string;
  operatorId: string;
  closingDate: string;
  recordedCashMinor: number;
  actualCashMinor: number;
  discrepancyMinor: number; // actual - recorded
  totalCardMinor: number;
  totalTipsMinor: number;
  totalRevenueMinor: number;
  notes?: string;
  isReconciled: boolean;
  createdAt: string;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}
