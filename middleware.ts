// ponytail: edge middleware — rate limiter, CORS, body size, content-type.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── Rate limiter (in-memory, per-instance) ─────────────────────────────────
const RATE_WINDOW_MS = 60_000;   // 1 minute
const MAX_REQUESTS = 30;         // per window

const hits = new Map<string, { count: number; resetAt: number }>();

// ponytail: cleanup old entries every 5 min, add a TTL cache if this grows
function cleanupHits() {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key);
  }
}
setInterval(cleanupHits, 300_000);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

// ── CORS ───────────────────────────────────────────────────────────────────
// ponytail: set ALLOWED_ORIGINS env var for production (comma-separated).
// Without it (dev mode), all origins are allowed.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? new Set(process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()))
  : null; // null = dev mode, allow all

function originAllowed(origin: string | null): boolean {
  if (!origin) return true; // same-origin, no Origin header
  if (!ALLOWED_ORIGINS) return true; // dev mode: allow all
  return ALLOWED_ORIGINS.has(origin);
}

// ── Body size ──────────────────────────────────────────────────────────────
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB (3MB file + overhead)

export function middleware(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const origin = req.headers.get('origin');

  // Rate limit — only POST /api/chat
  if (req.method === 'POST' && req.nextUrl.pathname === '/api/chat') {
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente em instantes.' },
        { status: 429 },
      );
    }
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) {
      return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // CORS — validate origin for POST
  if (req.method === 'POST' && !originAllowed(origin)) {
    return NextResponse.json(
      { error: 'Origem não permitida.' },
      { status: 403 },
    );
  }

  // Content-Type only enforced on POST /api/chat
  if (req.method === 'POST' && req.nextUrl.pathname === '/api/chat') {
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type deve ser application/json.' },
        { status: 415 },
      );
    }

    // Body size pre-check (best-effort, actual parsing still happens in route)
    const cl = req.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Payload excede o limite de 5 MB.' },
        { status: 413 },
      );
    }
  }

  // pass through, attach CORS headers to response
  const response = NextResponse.next();
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
