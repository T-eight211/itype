import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/game',
  '/game(.*)',
  '/settings',
  '/settings(.*)',
  '/leaderboard',
  '/leaderboard(.*)',
  '/sign-in(.*)',
  '/log-in(.*)',
  '/sign-up(.*)',
  '/otp(.*)',
  '/sso-callback(.*)',
  '/forgot-password(.*)',
  '/reset-password(.*)',
  '/about',
  '/about(.*)',
  '/pricing',
  '/pricing(.*)',
  '/api/admin/seed-clerk-users',
  '/api/admin/seed-clerk-users(.*)',
  '/api/admin/sync-clerk-users-to-db',
  '/api/admin/sync-clerk-users-to-db(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
