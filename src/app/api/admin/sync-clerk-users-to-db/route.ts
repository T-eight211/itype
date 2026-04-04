import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PAGE_SIZE = 100;
const DB_CHUNK = 500;

/**
 * Fetches every Clerk user id, then inserts missing rows into `users` (Supabase via Prisma).
 * Existing `user_id` values are left unchanged (`skipDuplicates`).
 *
 * Same auth as seed-clerk-users: `CLERK_USER_SEED_SECRET` + header `x-clerk-user-seed-secret`.
 *
 *   curl -X POST http://localhost:3000/api/admin/sync-clerk-users-to-db \
 *     -H "x-clerk-user-seed-secret: YOUR_SECRET"
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_USER_SEED_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CLERK_USER_SEED_SECRET is not set" },
      { status: 503 },
    );
  }

  if (req.headers.get("x-clerk-user-seed-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const clerkIds: string[] = [];
  let offset = 0;
  let totalCount = 0;

  for (;;) {
    const page = await client.users.getUserList({
      limit: PAGE_SIZE,
      offset,
      orderBy: "created_at",
    });

    totalCount = page.totalCount;
    for (const u of page.data) {
      clerkIds.push(u.id);
    }

    if (page.data.length === 0) break;
    offset += page.data.length;
    if (offset >= totalCount) break;
  }

  let inserted = 0;
  for (let i = 0; i < clerkIds.length; i += DB_CHUNK) {
    const chunk = clerkIds.slice(i, i + DB_CHUNK);
    const result = await prisma.user.createMany({
      data: chunk.map((user_id) => ({ user_id })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  return NextResponse.json({
    ok: true,
    clerkUserCount: clerkIds.length,
    clerkTotalCountReported: totalCount,
    rowsInserted: inserted,
    alreadyPresentOrSkipped: clerkIds.length - inserted,
  });
}

export async function GET() {
  return NextResponse.json({
    usage:
      "POST with header x-clerk-user-seed-secret matching CLERK_USER_SEED_SECRET. Inserts Clerk user ids into the users table (Prisma / Supabase).",
    example:
      'curl -X POST http://localhost:3000/api/admin/sync-clerk-users-to-db -H "x-clerk-user-seed-secret: YOUR_SECRET"',
  });
}
