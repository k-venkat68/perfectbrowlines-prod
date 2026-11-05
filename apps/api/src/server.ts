/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

app.use(express.json());

// Static Assets Routing (Ensures images load reliably in all environments)
app.use('/images', express.static(path.resolve(projectRoot, 'public/images')));
app.use('/src/assets/images', express.static(path.resolve(projectRoot, 'public/images')));
app.use(express.static(path.resolve(projectRoot, 'public')));

// =============================================================================
// MONGOOSE SCHEMAS & MODELS
// =============================================================================

export interface IVisitDoc {
  id: string;
  loc: number; // 0 = Battle Creek, 1 = Jackson
  date: string; // YYYY-MM-DD
  name: string;
  phone: string;
  services: string[];
  note: string;
  status: 'waiting' | 'in_service' | 'done' | 'cancelled';
  amount: number;
  pay: 'cash' | 'card' | 'credit' | '';
  tip: number;
  employee: string;
  ts: number;
  serviceStartedTs?: number;
  doneTs?: number;
}

const VisitSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  loc: { type: Number, required: true, index: true },
  date: { type: String, required: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  services: [{ type: String }],
  note: { type: String, default: '' },
  status: { type: String, enum: ['waiting', 'in_service', 'done', 'cancelled'], default: 'waiting', index: true },
  amount: { type: Number, default: 0 },
  pay: { type: String, enum: ['cash', 'card', 'credit', ''], default: '' },
  tip: { type: Number, default: 0 },
  employee: { type: String, default: '' },
  ts: { type: Number, default: () => Date.now() },
  serviceStartedTs: { type: Number },
  doneTs: { type: Number }
}, { timestamps: true, collection: 'visits' });
VisitSchema.index({ loc: 1, date: 1, ts: 1 });
VisitSchema.index({ date: 1, loc: 1, ts: 1 });

export interface IClosingDoc {
  id: string; // e.g. "0_2026-11-04"
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

const ClosingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  loc: { type: Number, required: true, index: true },
  date: { type: String, required: true, index: true },
  customers: { type: Number, default: 0 },
  sales: { type: Number, default: 0 },
  cash: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  tips: { type: Number, default: 0 },
  tipCash: { type: Number, default: 0 },
  tipCredit: { type: Number, default: 0 },
  expected: { type: Number, default: 0 },
  counted: { type: Number, default: null },
  closedTs: { type: Number, default: () => Date.now() }
}, { timestamps: true, collection: 'closings' });
ClosingSchema.index({ date: -1, loc: 1 });

export interface IShopSettingDoc {
  id: string;
  locations: string[];
  currency: string;
  staff: string[];
  services: IShopService[];
}

interface IShopService {
  n: string;
  p: number;
  locationPrices?: Record<string, number>;
}

const ShopSettingSchema = new mongoose.Schema({
  id: { type: String, default: 'shop', unique: true },
  locations: [{ type: String }],
  currency: { type: String, default: '$' },
  staff: [{ type: String }],
  services: [{
    n: { type: String, required: true },
    p: { type: Number, required: true },
    locationPrices: { type: mongoose.Schema.Types.Mixed, default: {} }
  }]
}, { timestamps: true, collection: 'shopsettings' });

interface IStaffCredential {
  email: string;
  passwordHash: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'LOCATION_OPERATOR';
  loc?: number;
  monthlySalary: number;
  isActive: boolean;
}

const StaffCredentialSchema = new mongoose.Schema<IStaffCredential>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['SUPER_ADMIN', 'LOCATION_OPERATOR'], required: true },
  loc: { type: Number, min: 0, max: 1 },
  monthlySalary: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, collection: 'staffcredentials' });

export const Visit = mongoose.models.Visit || mongoose.model('Visit', VisitSchema);
export const Closing = mongoose.models.Closing || mongoose.model('Closing', ClosingSchema);
export const ShopSetting = mongoose.models.ShopSetting || mongoose.model('ShopSetting', ShopSettingSchema);
const StaffCredential = mongoose.models.StaffCredential ||
  mongoose.model<IStaffCredential>('StaffCredential', StaffCredentialSchema);

// =============================================================================
// IN-MEMORY RESILIENT BACKUP DATA STORE
// =============================================================================
const DEFAULT_SETTINGS = {
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
};

const operationalModels = [Visit, Closing, ShopSetting, StaffCredential];

async function initializeMongoDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connected without an active database.');

  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name)
  );
  for (const model of operationalModels) {
    const collectionName = model.collection.name;
    if (existingCollections.has(collectionName)) continue;
    try {
      await db.createCollection(collectionName);
      console.log(`[MongoDB] Created collection "${collectionName}".`);
    } catch (error) {
      const mongoError = error as { code?: number; codeName?: string };
      if (mongoError.code !== 48 && mongoError.codeName !== 'NamespaceExists') throw error;
    }
  }

  await Promise.all(operationalModels.map(model => model.createIndexes()));
  await ShopSetting.updateOne(
    { id: 'shop' },
    { $setOnInsert: { ...DEFAULT_SETTINGS } },
    { upsert: true }
  );
  await seedStaffCredentials();
  await Visit.updateMany({ phone: { $exists: false } }, { $set: { phone: '' } });
  console.log('[MongoDB] Operational collections, indexes, and default shop settings are ready.');
}

function dayStr(d?: Date): string {
  d = d || new Date();
  const m = d.getMonth() + 1;
  const x = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${x < 10 ? '0' : ''}${x}`;
}

const today = dayStr();

let memorySettings: Omit<IShopSettingDoc, 'id'> = { ...DEFAULT_SETTINGS };

// Pure empty store — Zero synthetic visits; only authentic records from MongoDB
let memoryVisits: IVisitDoc[] = [];
let memoryClosings: IClosingDoc[] = [];

interface StaffSession {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'LOCATION_OPERATOR';
  loc?: number;
  expiresAt: number;
}

const staffSessions = new Map<string, StaffSession>();
const SESSION_COOKIE = 'pbl_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function getSession(req: express.Request): StaffSession | undefined {
  const cookie = req.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`));
  const sessionId = cookie?.slice(SESSION_COOKIE.length + 1);
  if (!sessionId) return undefined;
  const session = staffSessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    staffSessions.delete(sessionId);
    return undefined;
  }
  return session;
}

type StaffAccountConfig = {
  email: string | undefined;
  password: string | undefined;
  fullName: string;
  role: IStaffCredential['role'];
  loc?: number;
};

function configuredStaffAccounts(): StaffAccountConfig[] {
  const accounts: StaffAccountConfig[] = [
    {
      email: process.env.ADMIN_LOGIN_EMAIL,
      password: process.env.ADMIN_LOGIN_PASSWORD,
      fullName: 'Founder & Master Stylist (HQ)',
      role: 'SUPER_ADMIN' as const
    },
    {
      email: process.env.OPERATOR_BATTLECREEK_EMAIL,
      password: process.env.OPERATOR_BATTLECREEK_PASSWORD,
      fullName: 'Battle Creek Operator',
      role: 'LOCATION_OPERATOR' as const,
      loc: 0
    },
    {
      email: process.env.OPERATOR_JACKSON_EMAIL,
      password: process.env.OPERATOR_JACKSON_PASSWORD,
      fullName: 'Jackson Operator',
      role: 'LOCATION_OPERATOR' as const,
      loc: 1
    }
  ];
  return accounts.flatMap(account => {
    const email = account.email?.trim().toLowerCase();
    const password = account.password;
    if (!email || !password || /^(change-me|replace|placeholder)/i.test(password)) return [];
    return [{
      email,
      password,
      fullName: account.fullName,
      role: account.role,
      ...('loc' in account ? { loc: account.loc } : {})
    }];
  });
}

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex || !/^[\da-f]+$/i.test(saltHex) || !/^[\da-f]+$/i.test(hashHex)) {
    return Promise.resolve(false);
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== 64) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(timingSafeEqual(derivedKey, expected));
    });
  });
}

async function seedStaffCredentials(): Promise<void> {
  for (const account of configuredStaffAccounts()) {
    const email = account.email?.trim().toLowerCase();
    const password = account.password;
    if (!email || !password || /^(change-me|replace|placeholder)/i.test(password)) continue;
    if (await StaffCredential.exists({ email })) continue;

    await StaffCredential.updateOne(
      { email },
      {
        $setOnInsert: {
          email,
          passwordHash: await hashPassword(password),
          fullName: account.fullName,
          role: account.role,
          ...(account.loc === undefined ? {} : { loc: account.loc }),
          monthlySalary: 0,
          isActive: true
        }
      },
      { upsert: true }
    );
  }
}

function isShopService(value: unknown): value is IShopService {
  if (!value || typeof value !== 'object') return false;
  const service = value as { n?: unknown; p?: unknown; locationPrices?: unknown };
  const validLocationPrices = service.locationPrices === undefined ||
    (typeof service.locationPrices === 'object' &&
      service.locationPrices !== null &&
      !Array.isArray(service.locationPrices) &&
      Object.entries(service.locationPrices).every(([location, price]) =>
        (location === '0' || location === '1') &&
        typeof price === 'number' &&
        Number.isFinite(price) &&
        price >= 0
      ));
  return validLocationPrices &&
    typeof service.n === 'string' &&
    service.n.trim().length > 0 &&
    service.n.trim().length <= 100 &&
    typeof service.p === 'number' &&
    Number.isFinite(service.p) &&
    service.p >= 0;
}

function serviceCatalogSignature(services: IShopService[]): string {
  return JSON.stringify(services.map(service => ({
    n: service.n.trim(),
    p: Math.round(service.p * 100) / 100,
    locationPrices: Object.fromEntries(
      Object.entries(service.locationPrices || {}).sort(([a], [b]) => a.localeCompare(b))
    )
  })).sort((a, b) => a.n.localeCompare(b.n)));
}

// =============================================================================
// MONGODB CONNECTION MANAGER (Pure MongoDB Data Loading)
// =============================================================================
let mongoStatus = 'disconnected';
let mongoError: string | null = null;

function isMongoReady(): boolean {
  return mongoStatus === 'connected' && mongoose.connection.readyState === 1;
}

const syncMemoryToMongo = async () => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    // Load actual settings from MongoDB if present
    const existingSettings = await ShopSetting.findOne({ id: 'shop' });
    if (existingSettings) {
      memorySettings = {
        locations: existingSettings.locations || memorySettings.locations,
        currency: existingSettings.currency || '$',
        staff: existingSettings.staff || memorySettings.staff,
        services: existingSettings.services || memorySettings.services
      };
    }

    // Load actual visits strictly from MongoDB (no synthetic data)
    const dbVisits = await Visit.find().sort({ ts: 1 }).lean();
    memoryVisits = (dbVisits || []) as any;

    // Load actual closings strictly from MongoDB
    const dbClosings = await Closing.find().sort({ date: -1 }).lean();
    memoryClosings = (dbClosings || []) as any;

    console.log(`[MongoDB] Loaded live records from Atlas: ${memoryVisits.length} visits, ${memoryClosings.length} closings.`);
  } catch (err: any) {
    console.error('[MongoDB] Initial data sync failed:', err);
    throw err;
  }
};

const connectMongoDB = async (uri?: string): Promise<boolean> => {
  const targetUri = (uri || process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  const isPlaceholder = !targetUri ||
    targetUri === '""' ||
    targetUri === "''" ||
    /<[^>]+>/.test(targetUri) ||
    targetUri.includes('example.mongodb.net') ||
    targetUri.includes('cluster0.pbl.mongodb.net') ||
    targetUri.includes('your_mongodb');

  if (isPlaceholder) {
    mongoStatus = 'standby';
    mongoError = 'MONGODB_URI is not configured in .env.';
    console.warn(`[Database] ${mongoError}`);
    return false;
  }

  try {
    mongoStatus = 'connecting';
    const configuredDatabase = process.env.MONGODB_DB_NAME?.trim();
    await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      ...(configuredDatabase ? { dbName: configuredDatabase } : {})
    });
    await initializeMongoDatabase();
    await syncMemoryToMongo();
    mongoStatus = 'connected';
    mongoError = null;
    console.log('[Database] Connected to MongoDB Atlas for Perfect Browlines!');
    return true;
  } catch (err: any) {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.error('[Database] Failed to disconnect after initialization error:', disconnectError);
      }
    }
    mongoStatus = 'standby';
    mongoError = err instanceof Error ? err.message : String(err);
    console.error('[Database] MongoDB connection failed:', mongoError);
    return false;
  }
};

// Prevent unhandled error event emissions
mongoose.connection.on('error', (err) => {
  mongoStatus = 'standby';
  mongoError = err.message;
  console.error('[Database] MongoDB connection error:', mongoError);
});

// Initial non-blocking connect attempt
connectMongoDB();

// Background retry every 45s if on standby
setInterval(() => {
  if (mongoStatus === 'standby' && mongoose.connection.readyState === 0) {
    connectMongoDB();
  }
}, 45000);

// =============================================================================
// BACKEND REST API ENDPOINTS (/api/v1/*)
// =============================================================================

// Health Check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    brand: 'Perfect Browlines',
    studios: [
      { name: 'Battle Creek Studio', code: 'MI-BC-01', city: 'Battle Creek, MI' },
      { name: 'Jackson Studio', code: 'MI-JK-02', city: 'Jackson, MI' }
    ],
    currency: memorySettings.currency || 'USD',
    taxRate: '6.00% (Michigan State Sales Tax)',
    mongodb: {
      status: mongoStatus,
      readyState: mongoose.connection.readyState,
      database: mongoose.connection.db?.databaseName || null,
      collections: operationalModels.map(model => model.collection.name),
      initialized: mongoStatus === 'connected',
      error: mongoError
    },
    visitsCount: memoryVisits.length,
    closingsCount: memoryClosings.length,
    timestamp: new Date().toISOString()
  });
});

// Configure MongoDB URI dynamically from UI
app.post('/api/v1/config/mongo', async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return res.status(401).json({ success: false, error: 'Admin sign-in is required.' });
  }

  const mongoUri = req.body?.mongoUri;
  if (typeof mongoUri !== 'string' || !mongoUri.trim()) {
    return res.status(400).json({ success: false, error: 'Valid mongoUri string required' });
  }

  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    const connected = await connectMongoDB(mongoUri.trim());
    res.status(connected ? 200 : 503).json({
      success: connected,
      status: mongoStatus,
      message: connected ? 'Connected successfully to MongoDB Atlas. Data now saves to the database.' : 'MongoDB connection failed. Check the server logs and Atlas network access.',
      error: mongoError
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/auth/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ success: true, user: null });
  res.json({
    success: true,
    user: {
      id: session.id,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
      assignedLocationId: session.loc === undefined ? undefined : `loc-${session.loc}`,
      isActive: true
    }
  });
});

app.get('/api/v1/staff/compensation', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Staff sign-in is required.' });
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. Compensation could not be loaded.' });
  }

  try {
    const filter = session.role === 'SUPER_ADMIN'
      ? { role: 'LOCATION_OPERATOR' as const, isActive: true }
      : { email: session.email, role: 'LOCATION_OPERATOR' as const, isActive: true };
    const accounts = await StaffCredential.find(filter)
      .select('email fullName loc monthlySalary')
      .sort({ loc: 1 })
      .lean();
    return res.json({
      success: true,
      operators: accounts.map(account => ({
        email: account.email,
        fullName: account.fullName,
        loc: account.loc,
        monthlySalary: account.monthlySalary || 0
      }))
    });
  } catch (error) {
    console.error('[MongoDB staff compensation read failed]:', error);
    return res.status(500).json({ success: false, error: 'Could not load operator compensation.' });
  }
});

app.put('/api/v1/staff/compensation/:email', async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin sign-in is required.' });
  }
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. Compensation was not saved.' });
  }

  const email = req.params.email.trim().toLowerCase();
  const monthlySalary = Number(req.body?.monthlySalary);
  if (!email || !Number.isFinite(monthlySalary) || monthlySalary < 0) {
    return res.status(400).json({ success: false, error: 'Provide a valid non-negative monthly salary.' });
  }

  try {
    const operator = await StaffCredential.findOneAndUpdate(
      { email, role: 'LOCATION_OPERATOR', isActive: true },
      { $set: { monthlySalary: Math.round(monthlySalary * 100) / 100 } },
      { new: true, runValidators: true }
    ).select('email fullName loc monthlySalary').lean();
    if (!operator) return res.status(404).json({ success: false, error: 'Active location operator was not found.' });
    return res.json({
      success: true,
      operator: {
        email: operator.email,
        fullName: operator.fullName,
        loc: operator.loc,
        monthlySalary: operator.monthlySalary || 0
      }
    });
  } catch (error) {
    console.error('[MongoDB staff compensation save failed]:', error);
    return res.status(500).json({ success: false, error: 'Could not save operator compensation.' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'Staff sign-in is unavailable while MongoDB is disconnected.' });
  }

  try {
    const account = await StaffCredential.findOne({ email, isActive: true }).lean();
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
    }

    const session: StaffSession = {
      id: randomUUID(),
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      ...(account.role === 'LOCATION_OPERATOR' && account.loc !== undefined ? { loc: account.loc } : {}),
      expiresAt: Date.now() + SESSION_DURATION_MS
    };
    staffSessions.set(session.id, session);
    res.cookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: SESSION_DURATION_MS
    });
    return res.json({
      success: true,
      user: {
        id: session.id,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
        assignedLocationId: session.loc === undefined ? undefined : `loc-${session.loc}`,
        isActive: true
      }
    });
  } catch (error) {
    console.error('[MongoDB staff sign-in failed]:', error);
    return res.status(500).json({ success: false, error: 'Could not verify staff credentials.' });
  }
});

app.post('/api/v1/auth/logout', (req, res) => {
  const session = getSession(req);
  if (session) staffSessions.delete(session.id);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' });
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// VISITS API (Check-in, Live Queue, Billing, Served Today)
// -----------------------------------------------------------------------------

// GET /api/v1/visits?date=YYYY-MM-DD or all
app.get('/api/v1/visits', async (req, res) => {
  const { date, loc, from, to } = req.query;
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Staff sign-in is required.' });

  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. Customer records cannot be loaded.' });
  }

  try {
    const query: Record<string, unknown> = {};
    if (date) query.date = date;
    if (session.role === 'LOCATION_OPERATOR') {
      query.loc = session.loc;
    } else if (loc !== undefined) {
      const location = Number(loc);
      if (!Number.isInteger(location) || (location !== 0 && location !== 1)) {
        return res.status(400).json({ success: false, error: 'Invalid studio location.' });
      }
      query.loc = location;
    }
    if (from || to) {
      const dateRange: Record<string, string> = {};
      if (from) dateRange.$gte = from as string;
      if (to) dateRange.$lte = to as string;
      query.date = dateRange;
    }
    const visits = await Visit.find(query).sort({ ts: 1 }).lean();
    return res.json({ success: true, visits, source: 'mongodb' });
  } catch (err) {
    console.error('[MongoDB read visits failed]:', err);
    return res.status(500).json({ success: false, error: 'Could not load customer records.' });
  }
});

// POST /api/v1/visits (Create Check-in)
app.post('/api/v1/visits', async (req, res) => {
  const { loc, name, phone, services, note } = req.body;
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  const selectedLocation = Number(loc);
  const digitsOnlyPhone = normalizedPhone.replace(/\D/g, '');

  if (!normalizedName) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digitsOnlyPhone)) {
    return res.status(400).json({ success: false, error: 'Enter a valid 10-digit US phone number.' });
  }
  if (!Number.isInteger(selectedLocation) || (selectedLocation !== 0 && selectedLocation !== 1)) {
    return res.status(400).json({ success: false, error: 'Select a valid studio location.' });
  }
  if (!Array.isArray(services) || services.length === 0 || services.some(service => typeof service !== 'string')) {
    return res.status(400).json({ success: false, error: 'Choose at least one service.' });
  }
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. Please try again; your order was not saved.' });
  }

  const allowedServices = new Map(memorySettings.services.map(service => [
    service.n,
    service.locationPrices?.[String(selectedLocation)] ?? service.p
  ]));
  if (services.some((service: string) => !allowedServices.has(service))) {
    return res.status(400).json({ success: false, error: 'One or more selected services are unavailable.' });
  }
  const orderTotal = services.reduce((total: number, service: string) => total + (allowedServices.get(service) || 0), 0);
  const newVisit: IVisitDoc = {
    id: 'v-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    loc: selectedLocation,
    date: dayStr(),
    name: normalizedName,
    phone: normalizedPhone,
    services,
    note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
    status: 'waiting',
    amount: Math.round(orderTotal * 100) / 100,
    pay: '',
    tip: 0,
    employee: '',
    ts: Date.now()
  };

  try {
    await Visit.create(newVisit);
    memoryVisits.push(newVisit);
    return res.json({ success: true, visit: newVisit, source: 'mongodb' });
  } catch (err) {
    console.error('[MongoDB visit create error]:', err);
    return res.status(500).json({ success: false, error: 'Could not save your order. Please try again.' });
  }
});

// PUT /api/v1/visits/:id (Operator service start and checkout; customer orders cannot be edited or deleted)
app.put('/api/v1/visits/:id', async (req, res) => {
  const { id } = req.params;
  const session = getSession(req);
  if (!session || session.role !== 'LOCATION_OPERATOR') {
    return res.status(403).json({ success: false, error: 'Only a location operator can update or check out an order.' });
  }
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. The order update was not saved.' });
  }

  const { status, tip, pay } = req.body || {};
  if (status === 'in_service') {
    if (Object.keys(req.body || {}).length !== 1) {
      return res.status(400).json({ success: false, error: 'Starting service only accepts a status update.' });
    }

    try {
      const serviceStartedTs = Date.now();
      const updated = await Visit.findOneAndUpdate(
        { id, loc: session.loc, status: 'waiting' },
        { $set: { status: 'in_service', employee: session.fullName, serviceStartedTs } },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ success: false, error: 'This waiting order was not found at your location.' });
      const index = memoryVisits.findIndex(visit => visit.id === id);
      if (index !== -1) memoryVisits[index] = { ...memoryVisits[index], ...updated } as IVisitDoc;
      return res.json({ success: true, visit: updated, source: 'mongodb' });
    } catch (err) {
      console.error('[MongoDB visit service start error]:', err);
      return res.status(500).json({ success: false, error: 'Could not start service. Please try again.' });
    }
  }

  const numericTip = Number(tip);
  if (Object.keys(req.body || {}).some(key => key !== 'tip' && key !== 'pay' && key !== 'status')) {
    return res.status(400).json({ success: false, error: 'Operators may only set a tip and payment method.' });
  }
  if (status !== 'done' || !Number.isFinite(numericTip) || numericTip < 0 ||
      (pay !== 'cash' && pay !== 'card')) {
    return res.status(400).json({ success: false, error: 'A valid tip, Cash or Card payment, and checkout confirmation are required.' });
  }

  try {
    const updated = await Visit.findOneAndUpdate(
      { id, loc: session.loc, status: 'in_service' },
      {
        $set: {
          status: 'done',
          tip: Math.round(numericTip * 100) / 100,
          pay,
          doneTs: Date.now()
        }
      },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'This open order was not found at your location.' });
    const index = memoryVisits.findIndex(visit => visit.id === id);
    if (index !== -1) memoryVisits[index] = { ...memoryVisits[index], ...updated } as IVisitDoc;
    return res.json({ success: true, visit: updated, source: 'mongodb' });
  } catch (err) {
    console.error('[MongoDB visit checkout error]:', err);
    return res.status(500).json({ success: false, error: 'Could not save checkout. Please try again.' });
  }
});

// -----------------------------------------------------------------------------
// CLOSINGS API (Daily Drawer Reconciliations & Till Slips)
// -----------------------------------------------------------------------------

// GET /api/v1/closings
app.get('/api/v1/closings', async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin sign-in is required.' });
  }

  if (isMongoReady()) {
    try {
      const closings = await Closing.find().sort({ date: -1 }).limit(60).lean();
      return res.json({ success: true, closings, source: 'mongodb' });
    } catch (err) {
      console.warn('[MongoDB closings fetch error]:', err);
    }
  }

  return res.status(503).json({ success: false, error: 'MongoDB is unavailable. Closing records cannot be loaded.' });
});

// POST /api/v1/closings (Close Day)
app.post('/api/v1/closings', async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin sign-in is required.' });
  }

  const doc = req.body;
  if (!doc || !doc.id) {
    return res.status(400).json({ success: false, error: 'Closing payload missing id' });
  }
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. The closing was not saved.' });
  }

  try {
    const saved = await Closing.findOneAndUpdate({ id: doc.id }, { $set: doc }, { upsert: true, new: true });
    const index = memoryClosings.findIndex(closing => closing.id === doc.id);
    if (index >= 0) memoryClosings[index] = doc;
    else memoryClosings.unshift(doc);
    return res.json({ success: true, closing: saved, source: 'mongodb' });
  } catch (err) {
    console.error('[MongoDB closing save error]:', err);
    return res.status(500).json({ success: false, error: 'Could not save the closing record.' });
  }
});

// DELETE /api/v1/closings/:id (Reopen Day)
app.delete('/api/v1/closings/:id', async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin sign-in is required.' });
  }

  const { id } = req.params;

  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. The closing was not reopened.' });
  }

  try {
    await Closing.deleteOne({ id });
    memoryClosings = memoryClosings.filter(closing => closing.id !== id);
    return res.json({ success: true, source: 'mongodb' });
  } catch (err) {
    console.error('[MongoDB closing reopen error]:', err);
    return res.status(500).json({ success: false, error: 'Could not reopen the closing record.' });
  }
});

// -----------------------------------------------------------------------------
// SHOP SETTINGS API
// -----------------------------------------------------------------------------

// GET /api/v1/settings
app.get('/api/v1/settings', async (req, res) => {
  if (isMongoReady()) {
    try {
      const [s, openOrder] = await Promise.all([
        ShopSetting.findOne({ id: 'shop' }).lean(),
        Visit.exists({ status: { $in: ['waiting', 'in_service'] } })
      ]);
      return res.json({
        success: true,
        settings: s || memorySettings,
        pricingLocked: Boolean(openOrder),
        source: 'mongodb'
      });
    } catch (err) {
      console.warn('[MongoDB settings fetch error]:', err);
    }
  }

  res.json({ success: true, settings: memorySettings, pricingLocked: true, source: 'memory' });
});

// POST /api/v1/settings
app.post('/api/v1/settings', async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin sign-in is required.' });
  }

  const { staff, services } = req.body || {};
  if (!Array.isArray(staff) || staff.some((name: unknown) =>
    typeof name !== 'string' || !name.trim() || name.trim().length > 100
  ) || !Array.isArray(services) || services.length === 0 || !services.every(isShopService)) {
    return res.status(400).json({
      success: false,
      error: 'Provide at least one valid service with a unique name and non-negative price, and a valid staff list.'
    });
  }
  const normalizedServices = services.map(service => ({
    n: service.n.trim(),
    p: Math.round(service.p * 100) / 100,
    ...(service.locationPrices
      ? {
          locationPrices: Object.fromEntries(
            Object.entries(service.locationPrices).map(([location, price]) => [
              location,
              Math.round(price * 100) / 100
            ])
          )
        }
      : {})
  }));
  if (new Set(normalizedServices.map(service => service.n.toLocaleLowerCase())).size !== normalizedServices.length) {
    return res.status(400).json({ success: false, error: 'Service names must be unique.' });
  }
  const normalizedStaff = staff.map((name: string) => name.trim());

  if (!isMongoReady()) {
    return res.status(503).json({ success: false, error: 'MongoDB is unavailable. Settings were not saved.' });
  }

  try {
    const [existingSettings, openOrder] = await Promise.all([
      ShopSetting.findOne({ id: 'shop' }).lean(),
      Visit.exists({ status: { $in: ['waiting', 'in_service'] } })
    ]);
    const currentServices = existingSettings?.services || memorySettings.services;
    const pricingLocked = Boolean(openOrder);
    if (pricingLocked && serviceCatalogSignature(currentServices) !== serviceCatalogSignature(normalizedServices)) {
      return res.status(409).json({
        success: false,
        error: 'Service and price changes are locked while orders are in progress. Complete or cancel all open orders at every location, then try again.',
        pricingLocked: true
      });
    }

    const saved = await ShopSetting.findOneAndUpdate(
      { id: 'shop' },
      { $set: { staff: normalizedStaff, services: normalizedServices } },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    if (!saved) throw new Error('Shop settings were not returned after saving.');
    memorySettings = {
      locations: saved.locations || memorySettings.locations,
      currency: saved.currency || memorySettings.currency,
      staff: saved.staff || memorySettings.staff,
      services: saved.services || memorySettings.services
    };
    const remainingOpenOrder = await Visit.exists({ status: { $in: ['waiting', 'in_service'] } });
    return res.json({
      success: true,
      settings: memorySettings,
      pricingLocked: Boolean(remainingOpenOrder),
      source: 'mongodb'
    });
  } catch (err) {
    console.error('[MongoDB settings save error]:', err);
    return res.status(500).json({ success: false, error: 'Could not save shop settings.' });
  }
});

// Staff Credentials Directory
app.get('/api/v1/auth/staff-directory', (req, res) => {
  res.json({
    brand: 'Perfect Browlines',
    staffRoles: [
      {
        role: 'SUPER_ADMIN',
        title: 'HQ Founder & Master Stylist',
        email: 'admin@perfectbrowlines.com',
        locationScope: 'All Studios (Battle Creek & Jackson)'
      },
      {
        role: 'LOCATION_OPERATOR',
        title: 'Battle Creek Studio Operator',
        email: 'battlecreek@perfectbrowlines.com',
        locationCode: 'MI-BC-01'
      },
      {
        role: 'LOCATION_OPERATOR',
        title: 'Jackson Studio Operator',
        email: 'jackson@perfectbrowlines.com',
        locationCode: 'MI-JK-02'
      }
    ]
  });
});

// =============================================================================
// DEV / PROD SERVER BOOTSTRAP
// =============================================================================
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(projectRoot, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(projectRoot, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`Perfect Browlines Platform Running on Port ${PORT}`);
    console.log(`Battle Creek & Jackson Studios`);
    console.log(`Full MongoDB Read/Write API Active (/api/v1/*)`);
    console.log(`====================================================`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
