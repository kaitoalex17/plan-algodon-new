import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Rutas públicas que no requieren cookie de sesión
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/public-report") ||
    pathname.startsWith("/api/public-report") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/manifest.json") ||
    pathname.startsWith("/icons") ||
    pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Extraer token de la cookie de sesión de NextAuth
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 3. Si no hay cookie de sesión válida o se ha perdido, redirigir automáticamente a /login
  if (!token || !token.id) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Protección para rutas de administración (/admin/...)
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
