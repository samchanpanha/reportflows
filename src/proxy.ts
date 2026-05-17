import { NextResponse } from "next/server"
import { auth } from "@/auth"

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl

  const publicRoutes = [
    "/login",
    "/register",
    "/api/auth",
    "/api",
    "/_next",
    "/favicon.ico",
  ]
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  if (!req.auth) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
}
