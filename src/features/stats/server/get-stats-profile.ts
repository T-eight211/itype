import { clerkClient } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  BADGES,
  type BadgeCategory,
  type BadgeDefinition,
  type BadgeKey,
} from "@/features/badges/lib/badges";
import { xpProgressToNextLevel } from "@/features/xp/lib/level";

type StatsTopBadge = {
  category: BadgeCategory;
  key: BadgeKey;
  name: string;
  description: string;
};

export type StatsProfile = {
  username: string;
  profileImageUrl: string | null;
  joinedAtLabel: string;
  testsCompleted: number;
  timeTypingLabel: string;
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpNeededForNextLevel: number;
  xpProgressPercent: number;
  topBadgesByCategory: Array<{
    category: BadgeCategory;
    badge: StatsTopBadge | null;
  }>;
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
  if (user.username && user.username.trim().length > 0) return user.username.trim();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fullName.length > 0) return fullName;
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

const BADGE_CATEGORIES: BadgeCategory[] = [
  "speed",
  "accuracy",
  "streak",
  "level",
  "practice",
  "special",
];

const BADGE_BY_KEY = new Map<BadgeKey, BadgeDefinition>(
  BADGES.map((badge) => [badge.key, badge]),
);

const BADGE_RANK_BY_KEY = new Map<BadgeKey, number>(
  BADGES.map((badge, index) => [badge.key, index]),
);

function topBadgeForCategory(
  category: BadgeCategory,
  earnedBadgeKeys: Set<BadgeKey>,
): StatsTopBadge | null {
  const ranked = BADGES.filter(
    (badge) => badge.category === category && earnedBadgeKeys.has(badge.key),
  ).sort(
    (a, b) =>
      (BADGE_RANK_BY_KEY.get(b.key) ?? 0) - (BADGE_RANK_BY_KEY.get(a.key) ?? 0),
  );

  const top = ranked[0];
  if (!top) return null;

  const badge = BADGE_BY_KEY.get(top.key);
  if (!badge) return null;

  return {
    category,
    key: badge.key,
    name: badge.name,
    description: badge.description,
  };
}

export async function getStatsProfile(): Promise<StatsProfile> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authenticated user is required");
  }

  const client = await clerkClient();
  const [user, typingSummary, xp, userBadges] = await Promise.all([
    client.users.getUser(userId),
    prisma.typingResults.aggregate({
      where: { user_id: userId },
      _count: { id: true },
      _sum: { elapsed_seconds: true },
    }),
    prisma.userXp.findUnique({
      where: { user_id: userId },
      select: { total_xp: true },
    }),
    prisma.userBadge.findMany({
      where: { user_id: userId },
      select: { badge_key: true },
    }),
  ]);

  const totalXp = xp?.total_xp ?? 0;
  const progress = xpProgressToNextLevel(totalXp);
  const earnedBadgeKeys = new Set<BadgeKey>(
    userBadges
      .map((b) => b.badge_key)
      .filter((key): key is BadgeKey => BADGE_BY_KEY.has(key as BadgeKey)),
  );
  const topBadgesByCategory = BADGE_CATEGORIES.map((category) => ({
    category,
    badge: topBadgeForCategory(category, earnedBadgeKeys),
  }));

  return {
    username: formatDisplayName(user),
    profileImageUrl: user.imageUrl ?? null,
    joinedAtLabel: DATE_FORMATTER.format(user.createdAt),
    testsCompleted: typingSummary._count.id,
    timeTypingLabel: formatElapsed(typingSummary._sum.elapsed_seconds ?? 0),
    level: progress.level,
    totalXp,
    xpIntoLevel: progress.xpInto,
    xpNeededForNextLevel: progress.xpNeeded,
    xpProgressPercent: Math.round(progress.progressRatio * 100),
    topBadgesByCategory,
  };
}
