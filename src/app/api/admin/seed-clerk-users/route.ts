import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { NextResponse } from "next/server";
import seedUsers from "@/data/user.json";

export const runtime = "nodejs";

type SeedUser = {
  username: string;
  email: string;
  password: string;
};

function errorSummary(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.map((e) => e.longMessage ?? e.message).join("; ") ?? err.message
    );
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function isDuplicateClerkUser(err: unknown): boolean {
  if (!isClerkAPIResponseError(err)) return false;
  return (
    err.errors?.some((e) => {
      const code = e.code ?? "";
      return (
        code === "form_identifier_exists" ||
        code === "form_identifier_exists__email_address" ||
        code === "form_identifier_exists__username"
      );
    }) ?? false
  );
}

/**
 * Bulk-create Clerk users from `src/data/user.json` (username, email, password).
 * Backend-created emails are verified automatically (no end-user verification step).
 *
 * Setup: set `CLERK_USER_SEED_SECRET` in `.env.local`.
 * Run:
 *   curl -X POST http://localhost:3000/api/admin/seed-clerk-users \
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

  const users = (seedUsers as SeedUser[]).filter(
    (u) =>
      typeof u?.username === "string" &&
      u.username.length > 0 &&
      typeof u?.email === "string" &&
      u.email.length > 0 &&
      typeof u?.password === "string" &&
      u.password.length > 0,
  );

  const client = await clerkClient();

  const created: { id: string; email: string; username: string }[] = [];
  const skipped: { email: string; username: string; reason: string }[] = [];
  const failed: { email: string; username: string; error: string }[] = [];

  for (const u of users) {
    try {
      const user = await client.users.createUser({
        emailAddress: [u.email],
        username: u.username,
        password: u.password,
        skipPasswordChecks: true,
      });
      created.push({
        id: user.id,
        email: u.email,
        username: u.username,
      });
    } catch (err) {
      if (isDuplicateClerkUser(err)) {
        skipped.push({
          email: u.email,
          username: u.username,
          reason: errorSummary(err),
        });
      } else {
        failed.push({
          email: u.email,
          username: u.username,
          error: errorSummary(err),
        });
      }
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    totalInFile: users.length,
    createdCount: created.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    created,
    skipped,
    failed,
  });
}

export async function GET() {
  return NextResponse.json({
    usage:
      "POST with header x-clerk-user-seed-secret set to the same value as env CLERK_USER_SEED_SECRET.",
    example:
      'curl -X POST http://localhost:3000/api/admin/seed-clerk-users -H "x-clerk-user-seed-secret: YOUR_SECRET"',
  });
}
