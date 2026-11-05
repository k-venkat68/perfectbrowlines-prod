import mongoose, { Schema, Document } from 'mongoose';
import { UserRole, BookingStatus, PaymentStatus, ServiceSnapshot, SplitPaymentRecord } from '@/src/types/index';

// =========================================================================
// TENANT MODEL
// =========================================================================
export interface ITenant extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>({
  slug: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  brandName: { type: String, required: true },
  logoUrl: { type: String, required: true },
  faviconUrl: { type: String },
  primaryColor: { type: String, default: '#FAF8F5' }, // Ivory
  secondaryColor: { type: String, default: '#1A1A1A' }, // Charcoal
  accentColor: { type: String, default: '#C5A880' }, // Champagne Gold
  currency: { type: String, default: 'INR' },
  currencySymbol: { type: String, default: '₹' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  invoicePrefix: { type: String, default: 'INV' },
  taxId: { type: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// =========================================================================
// LOCATION MODEL
// =========================================================================
export interface ILocation extends Document {
  tenantId: mongoose.Types.ObjectId;
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
  openingHours: Array<{
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
    openTime: string;  // "09:00"
    closeTime: string; // "20:00"
    isOpen: boolean;
  }>;
  holidays: Date[];
  timezone: string;
  isActive: boolean;
}

const LocationSchema = new Schema<ILocation>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  address: {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    postalCode: { type: String, required: true }
  },
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  contactNumber: { type: String, required: true },
  email: { type: String, required: true },
  openingHours: [{
    dayOfWeek: { type: Number, required: true },
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
    isOpen: { type: Boolean, default: true }
  }],
  holidays: [{ type: Date }],
  timezone: { type: String, default: 'Asia/Kolkata' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

LocationSchema.index({ tenantId: 1, code: 1 }, { unique: true });

// =========================================================================
// USER MODEL (Super Admin & Location Operator)
// Strict rule: Only ONE active operator assigned per location
// =========================================================================
export interface IUser extends Document {
  tenantId: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  role: UserRole;
  assignedLocationId?: mongoose.Types.ObjectId;
  fullName: string;
  phone: string;
  isActive: boolean;
  refreshTokenHash?: string;
}

const UserSchema = new Schema<IUser>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['SUPER_ADMIN', 'LOCATION_OPERATOR', 'CUSTOMER'], required: true },
  assignedLocationId: { type: Schema.Types.ObjectId, ref: 'Location' },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  refreshTokenHash: { type: String }
}, { timestamps: true });

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// Partial Unique Index: Exactly one active operator per location
UserSchema.index(
  { tenantId: 1, assignedLocationId: 1, role: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      role: 'LOCATION_OPERATOR', 
      isActive: true, 
      assignedLocationId: { $exists: true } 
    } 
  }
);

// =========================================================================
// SERVICE & CATEGORY
// =========================================================================
export interface IServiceCategory extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

const ServiceCategorySchema = new Schema<IServiceCategory>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: { type: String },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

ServiceCategorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export interface IService extends Document {
  tenantId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  durationMinutes: number;
  bufferTimeMinutes: number;
  basePriceMinor: number; // Integer (minor currency unit)
  locationPriceOverrides: Array<{
    locationId: mongoose.Types.ObjectId;
    priceMinor: number;
  }>;
  taxRateBasisPoints: number; // e.g. 1800 = 18.00%
  availableLocationIds: mongoose.Types.ObjectId[];
  isActive: boolean;
}

const ServiceSchema = new Schema<IService>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'ServiceCategory', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String },
  durationMinutes: { type: Number, required: true },
  bufferTimeMinutes: { type: Number, default: 10 },
  basePriceMinor: { type: Number, required: true },
  locationPriceOverrides: [{
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    priceMinor: { type: Number, required: true }
  }],
  taxRateBasisPoints: { type: Number, default: 1800 },
  availableLocationIds: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

ServiceSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

// =========================================================================
// BOOKING MODEL (Immutable Service Snapshots & Minor Unit Math)
// =========================================================================
export interface IBooking extends Document {
  tenantId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
  bookingReference: string;
  idempotencyKey?: string;
  customer: {
    fullName: string;
    phone: string;
    email: string;
    notes?: string;
  };
  serviceSnapshots: ServiceSnapshot[];
  totalDurationMinutes: number;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  status: BookingStatus;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  operatorId?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  bookingReference: { type: String, required: true, unique: true, index: true },
  idempotencyKey: { type: String, index: true, sparse: true },
  customer: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    notes: { type: String }
  },
  serviceSnapshots: [{
    serviceId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    priceMinor: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
    bufferTimeMinutes: { type: Number, required: true },
    taxRateBasisPoints: { type: Number, required: true }
  }],
  totalDurationMinutes: { type: Number, required: true },
  scheduledStartTime: { type: Date, required: true, index: true },
  scheduledEndTime: { type: Date, required: true, index: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'],
    default: 'PENDING',
    index: true 
  },
  subtotalMinor: { type: Number, required: true },
  discountMinor: { type: Number, default: 0 },
  taxMinor: { type: Number, required: true },
  totalMinor: { type: Number, required: true },
  operatorId: { type: Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: { type: String }
}, { timestamps: true });

BookingSchema.index(
  { tenantId: 1, locationId: 1, scheduledStartTime: 1, scheduledEndTime: 1 },
  { background: true }
);

// =========================================================================
// ORDER & ISOLATED TIP TRACKING
// =========================================================================
export interface IOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  orderNumber: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;       // Service gross + tax - discount (EXCLUDES TIP)
  tipMinor: number;         // Segregated tip
  paidAmountMinor: number;
  outstandingBalanceMinor: number;
  paymentStatus: PaymentStatus;
  splits: SplitPaymentRecord[];
  completedAt?: Date;
}

const OrderSchema = new Schema<IOrder>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  orderNumber: { type: String, required: true, unique: true, index: true },
  subtotalMinor: { type: Number, required: true },
  discountMinor: { type: Number, default: 0 },
  taxMinor: { type: Number, required: true },
  totalMinor: { type: Number, required: true },
  tipMinor: { type: Number, default: 0 },
  paidAmountMinor: { type: Number, default: 0 },
  outstandingBalanceMinor: { type: Number, required: true },
  paymentStatus: { 
    type: String, 
    enum: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'], 
    default: 'PENDING',
    index: true 
  },
  splits: [{
    method: { type: String, enum: ['CASH', 'CARD', 'GATEWAY'], required: true },
    amountMinor: { type: Number, required: true },
    referenceId: { type: String },
    processedAt: { type: String }
  }],
  completedAt: { type: Date }
}, { timestamps: true });

export interface IDailyClosing extends Document {
  tenantId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
  operatorId: mongoose.Types.ObjectId;
  closingDate: Date;
  recordedCashMinor: number;
  actualCashMinor: number;
  discrepancyMinor: number;
  totalCardMinor: number;
  totalTipsMinor: number;
  totalRevenueMinor: number;
  notes?: string;
  isReconciled: boolean;
}

const DailyClosingSchema = new Schema<IDailyClosing>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  operatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  closingDate: { type: Date, required: true, index: true },
  recordedCashMinor: { type: Number, required: true },
  actualCashMinor: { type: Number, required: true },
  discrepancyMinor: { type: Number, required: true },
  totalCardMinor: { type: Number, required: true },
  totalTipsMinor: { type: Number, required: true },
  totalRevenueMinor: { type: Number, required: true },
  notes: { type: String },
  isReconciled: { type: Boolean, default: false }
}, { timestamps: true });

DailyClosingSchema.index({ tenantId: 1, locationId: 1, closingDate: 1 }, { unique: true });

export const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);
export const Location = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema);
export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const ServiceCategory = mongoose.models.ServiceCategory || mongoose.model<IServiceCategory>('ServiceCategory', ServiceCategorySchema);
export const Service = mongoose.models.Service || mongoose.model<IService>('Service', ServiceSchema);
export const Booking = mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
export const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
export const DailyClosing = mongoose.models.DailyClosing || mongoose.model<IDailyClosing>('DailyClosing', DailyClosingSchema);
