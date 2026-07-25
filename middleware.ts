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
// In dev (no env var), allow all localhost + 127.0.0.1 origins.
function buildAllowedOrigins(): Set<string> {
  const env = process.env.ALLOWED_ORIGINS;
  if (env) return new Set(env.split(',').map((s) => s.trim()));
  // dev: permissive for local development
  return new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
  ]);
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }
  return {};
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
    const corsHeaders = getCorsHeaders(origin);
    if (Object.keys(corsHeaders).length === 0) {
      return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
    }
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // CORS — validate origin for POST
  if (req.method === 'POST' && origin) {
    if (!ALLOWED_ORIGINS.has(origin)) {
      return NextResponse.json(
        { error: 'Origem não permitida.' },
        { status: 403 },
      );
    }
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
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
