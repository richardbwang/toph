import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * First line of defence: bounce anonymous visitors to /login before any page
 * renders. This only checks that a session cookie *exists* (cheap, no DB);
 * the real check — is the session valid and unexpired? — happens in
 * `requireUser()` inside the protected layout and in every server action.
 *
 * A cookie's presence is deliberately NOT treated as "signed in" for /login:
 * a stale cookie (session expired, revoked, or wiped by a reseed) would
 * otherwise loop — /login → /dashboard → requireUser() → /login → … The login
 * page checks the session against the database itself and redirects only
 * when it is actually valid.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") return NextResponse.next();
  if (!hasCookie) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except static assets, the audio/avatars we ship, and the API.
  matcher: ["/((?!api|_next/static|_next/image|audio|avatars|favicon.ico|icon.svg|.*\\.png$|.*\\.svg$).*)"],
};
