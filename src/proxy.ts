import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * First line of defence: bounce anonymous visitors to /login before any page
 * renders. This only checks that a session cookie *exists* (cheap, no DB);
 * the real check — is the session valid and unexpired? — happens in
 * `requireUser()` inside the protected layout and in every server action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return hasCookie ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }
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
