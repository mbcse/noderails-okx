import { NextResponse, type NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────
// Next.js Middleware — server-side route protection + security headers
// ────────────────────────────────────────────────────────────

const PUBLIC_PATHS = ["/login", "/register", "/", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes, static files, and API proxy paths
  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api")
  ) {
    return addSecurityHeaders(NextResponse.next());
  }

  // For dashboard routes, check for the refresh token cookie.
  // If it doesn't exist, the user is definitely not logged in.
  const refreshCookie = request.cookies.get("mtxm_rt");
  if (!refreshCookie) {
    const loginUrl = new URL("/login", request.url);
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return addSecurityHeaders(NextResponse.next());
}

/** Add security headers to every response */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
