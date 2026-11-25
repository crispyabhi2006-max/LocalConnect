import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp as initializeAdminApp, getApps as getAdminApps, getApp as getAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseProjectId = '';
let firebaseWebConfig: Record<string, unknown> | null = null;
if (fs.existsSync(firebaseConfigPath)) {
  const raw = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as Record<string, unknown>;
  firebaseWebConfig = raw;
  firebaseProjectId = typeof raw.projectId === 'string' ? raw.projectId : '';
}

const VALID_NOTIFICATION_TYPES = new Set([
  'appointment_new',
  'appointment_confirmed',
  'appointment_rejected',
  'appointment_cancelled',
  'appointment_completed',
  'review_new',
]);

const adminApp = firebaseProjectId
  ? getAdminApps().length > 0
    ? getAdminApp()
    : initializeAdminApp({ projectId: firebaseProjectId })
  : null;

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email?: string;
    emailVerified: boolean;
  };
}

async function requireFirebaseAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!adminApp) {
    res.status(503).json({ error: 'Firebase project is not configured on the server.' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization Bearer token.' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Empty authentication token.' });
    return;
  }

  try {
    const decoded = await getAdminAuth(adminApp).verifyIdToken(idToken);
    req.authUser = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: Boolean(decoded.email_verified),
    };
    next();
  } catch (err) {
    console.error('Token verification failed:', err instanceof Error ? err.message : String(err));
    res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Serve Firebase Cloud Messaging Service Worker dynamically using runtime public config
  app.get('/firebase-messaging-sw.js', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    if (!firebaseWebConfig) {
      res.send('// Firebase configuration unavailable.');
      return;
    }
    const publicSwConfig = {
      apiKey: firebaseWebConfig.apiKey || '',
      authDomain: firebaseWebConfig.authDomain || '',
      projectId: firebaseWebConfig.projectId || '',
      storageBucket: firebaseWebConfig.storageBucket || '',
      messagingSenderId: firebaseWebConfig.messagingSenderId || '',
      appId: firebaseWebConfig.appId || '',
    };
    res.send(
      `importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');\n` +
        `importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');\n` +
        `firebase.initializeApp(${JSON.stringify(publicSwConfig)});\n` +
        `const messaging = firebase.messaging();\n` +
        `messaging.onBackgroundMessage((payload) => {\n` +
        `  const title = payload?.notification?.title || 'LocalConnect Update';\n` +
        `  const options = { body: payload?.notification?.body || 'You have a new appointment update.' };\n` +
        `  self.registration.showNotification(title, options);\n` +
        `});\n`
    );
  });

  // Health & non-secret configuration check
  app.get('/api/health', (_req: Request, res: Response) => {
    const hasMapsKey = Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY);
    res.json({
      status: 'ok',
      service: 'LocalConnect API',
      firebaseProjectId: firebaseProjectId || null,
      mapsConfigured: hasMapsKey,
      fcmVapidConfigured: Boolean(process.env.VITE_FIREBASE_VAPID_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // Public runtime Maps client key endpoint (reads scoped public browser key from environment)
  app.get('/api/config/maps-status', (_req: Request, res: Response) => {
    const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      configured: Boolean(key),
      // Only return the browser-scoped VITE_ key if Vite didn't inline it at build time
      browserKey: process.env.VITE_GOOGLE_MAPS_API_KEY || '',
    });
  });

  // Verify caller's Firebase ID token (works on Starter Tier without IAM)
  app.post('/api/auth/verify', requireFirebaseAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      verified: true,
      uid: req.authUser?.uid,
      email: req.authUser?.email || null,
      emailVerified: req.authUser?.emailVerified || false,
    });
  });

  // Server-side Geocoding proxy (avoids browser CORS trap CF1)
  app.post('/api/maps/geocode', async (req: Request, res: Response) => {
    const { address, city, postalCode } = req.body as {
      address?: unknown;
      city?: unknown;
      postalCode?: unknown;
    };

    if (typeof address !== 'string' && typeof city !== 'string') {
      res.status(400).json({ error: 'Address or city string is required.' });
      return;
    }

    const queryParts = [
      typeof address === 'string' ? address.trim() : '',
      typeof city === 'string' ? city.trim() : '',
      typeof postalCode === 'string' ? postalCode.trim() : '',
    ].filter(Boolean);

    const fullAddress = queryParts.join(', ');
    if (fullAddress.length < 2 || fullAddress.length > 350) {
      res.status(400).json({ error: 'Address query must be between 2 and 350 characters.' });
      return;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key is not configured on the server.' });
      return;
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', fullAddress);
      url.searchParams.set('key', apiKey);

      const response = await fetch(url.toString());
      if (response.status === 429) {
        res.status(429).json({
          error: 'Google Maps Platform quota reached.',
          status: 'RESOURCE_EXHAUSTED',
        });
        return;
      }

      const data = (await response.json()) as {
        status?: string;
        error_message?: string;
        results?: Array<{
          formatted_address?: string;
          place_id?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
        }>;
      };

      if (data.status === 'OVER_QUERY_LIMIT') {
        res.status(429).json({
          error: data.error_message || 'Google Maps Geocoding quota exceeded.',
          status: 'RESOURCE_EXHAUSTED',
        });
        return;
      }

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        res.status(404).json({
          error: data.error_message || 'Address could not be geocoded. Please adjust the pin on the map.',
          geocodeStatus: data.status || 'ZERO_RESULTS',
        });
        return;
      }

      const top = data.results[0];
      const lat = top.geometry?.location?.lat;
      const lng = top.geometry?.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        res.status(404).json({ error: 'Geocoding response did not include coordinates.' });
        return;
      }

      res.json({
        lat,
        lng,
        formattedAddress: top.formatted_address || fullAddress,
        placeId: top.place_id || '',
      });
    } catch (err) {
      console.error('Geocoding proxy error:', err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: 'Failed to contact Google Geocoding API.' });
    }
  });

  // Server-side appointment validation & policy check
  app.post('/api/appointments/validate', requireFirebaseAuth, (req: AuthenticatedRequest, res: Response) => {
    const { action, date, timeSlot, cancellationPolicyHours, timezoneOffsetMinutes } = req.body as {
      action?: unknown;
      date?: unknown;
      timeSlot?: unknown;
      cancellationPolicyHours?: unknown;
      timezoneOffsetMinutes?: unknown;
    };

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
      return;
    }

    if (typeof timeSlot !== 'string' || !/^\d{2}:\d{2}$/.test(timeSlot)) {
      res.status(400).json({ error: 'Invalid time slot format. Expected HH:mm.' });
      return;
    }

    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = timeSlot.split(':').map(Number);
    if (
      !Number.isInteger(y) ||
      !Number.isInteger(m) ||
      !Number.isInteger(d) ||
      !Number.isInteger(hh) ||
      !Number.isInteger(mm) ||
      hh < 0 ||
      hh > 23 ||
      mm < 0 ||
      mm > 59
    ) {
      res.status(400).json({ error: 'Invalid appointment date/time.' });
      return;
    }

    // JS Date.getTimezoneOffset() returns (UTC - local) in minutes (e.g. PST = +480)
    const tzOffsetMins =
      typeof timezoneOffsetMinutes === 'number' &&
      Number.isFinite(timezoneOffsetMinutes) &&
      timezoneOffsetMinutes >= -840 &&
      timezoneOffsetMinutes <= 840
        ? timezoneOffsetMinutes
        : 0;

    const utcBaseMs = Date.UTC(y, m - 1, d, hh, mm, 0);
    if (Number.isNaN(utcBaseMs)) {
      res.status(400).json({ error: 'Invalid appointment date/time.' });
      return;
    }
    const slotEpochMs = utcBaseMs + tzOffsetMins * 60 * 1000;

    if (action === 'book') {
      if (slotEpochMs < Date.now() - 5 * 60 * 1000) {
        res.status(400).json({ error: 'Cannot book an appointment in the past.' });
        return;
      }
      res.json({ valid: true, uid: req.authUser?.uid });
      return;
    }

    if (action === 'cancel') {
      const policyHours =
        typeof cancellationPolicyHours === 'number' && Number.isFinite(cancellationPolicyHours)
          ? Math.max(0, Math.min(168, cancellationPolicyHours))
          : 0;
      const hoursUntil = (slotEpochMs - Date.now()) / (1000 * 60 * 60);
      if (policyHours > 0 && hoursUntil < policyHours) {
        res.status(400).json({
          error: `Cancellations require at least ${policyHours} hours notice before the appointment time.`,
          policyHours,
        });
        return;
      }
      res.json({ valid: true, uid: req.authUser?.uid });
      return;
    }

    res.status(400).json({ error: 'Unsupported validation action.' });
  });

  // Notification dispatch verification endpoint
  app.post('/api/notifications/dispatch', requireFirebaseAuth, (req: AuthenticatedRequest, res: Response) => {
    const { recipientUid, title, message, type } = req.body as {
      recipientUid?: unknown;
      title?: unknown;
      message?: unknown;
      type?: unknown;
    };

    if (
      typeof recipientUid !== 'string' ||
      recipientUid.trim().length < 1 ||
      recipientUid.length > 128 ||
      typeof title !== 'string' ||
      title.trim().length < 1 ||
      title.length > 150 ||
      typeof message !== 'string' ||
      message.trim().length < 1 ||
      message.length > 500 ||
      typeof type !== 'string' ||
      !VALID_NOTIFICATION_TYPES.has(type)
    ) {
      res.status(400).json({ error: 'Invalid notification dispatch payload.' });
      return;
    }

    res.json({
      dispatched: true,
      senderUid: req.authUser?.uid,
      recipientUid: recipientUid.trim(),
      fcmPushConfigured: Boolean(process.env.VITE_FIREBASE_VAPID_KEY),
    });
  });

  // Return JSON 404 for unknown API paths rather than SPA HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Vite dev middleware vs production static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LocalConnect server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LocalConnect server:', err);
  process.exit(1);
});
