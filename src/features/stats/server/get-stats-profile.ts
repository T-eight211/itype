import { clerkClient } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export type StatsProfile = {
  username: string;
  profileImageUrl: string | null;
  joinedAtLabel: string;
  testsCompleted: number;
  timeTypingLabel: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDisplayName(user: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
}) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fullName.length > 0) return fullName;
  if (user.username && user.username.trim().length > 0) return user.username.trim();
  const emailLocal = user.primaryEmailAddress?.emailAddress?.split("@")[0]?.trim();
  if (emailLocal) return emailLocal;
  return "IType User";
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

export async function getStatsProfile(): Promise<StatsProfile> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authenticated user is required");
  }

  const client = await clerkClient();
  const [user, typingSummary] = await Promise.all([
    client.users.getUser(userId),
    prisma.typingResults.aggregate({
      where: { user_id: userId },
      _count: { id: true },
      _sum: { elapsed_seconds: true },
    }),
  ]);

  return {
    username: formatDisplayName(user),
    profileImageUrl: user.imageUrl ?? null,
    joinedAtLabel: DATE_FORMATTER.format(user.createdAt),
    testsCompleted: typingSummary._count.id,
    timeTypingLabel: formatElapsed(typingSummary._sum.elapsed_seconds ?? 0),
  };
}
