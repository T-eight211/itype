import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { utcCalendarDateFromInstant } from "@/features/typing-game/server/upsert-daily-leaderboards";
import { BADGES, type BadgeCategory, type BadgeKey } from "@/features/badges/lib/badges";
import {
  DAILY_LEADERBOARD_MAX,
  LEADERBOARD_PAGE_SIZE,
} from "@/features/leaderboard/constants";

// These are the four leaderboard tabs supported by the app. Each value maps to
// one Prisma leaderboard table and one UI board.
export type LeaderboardBoard =
  | "all_time_60s"
  | "all_time_15s"
  | "daily_60s"
  | "daily_15s";

// This is the row shape sent to the leaderboard UI. It combines the saved
// TypingResults metrics with Clerk profile data and badge data.
export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  profileImageUrl: string | null;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number | null;
  endedAt: string;
  topBadges: Array<{
    key: BadgeKey;
    name: string;
    category: BadgeCategory;
  }>;
};

export { DAILY_LEADERBOARD_MAX, LEADERBOARD_PAGE_SIZE } from "@/features/leaderboard/constants";

// Daily boards only show a limited number of places. The cutoff tells the UI how
// many places are filled and what WPM is currently needed to enter the top list.
export type DailyCutoffInfo = {
  slotsFilled: number;
  cutoffWpm: number | null;
};

// Full page payload returned by leaderboard page queries and server actions.
export type LeaderboardPagePayload = {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  dailyDateUtc?: string;
  dailyCutoff?: DailyCutoffInfo;
};

// Snapshot for the signed-in user's own placement. This is fetched separately so
// the UI can show "your rank" even when the user is not on the current page.
export type LeaderboardViewerSnapshot = {
  rank: number;
  total: number;
  topPercent: number;
  username: string;
  profileImageUrl: string | null;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number | null;
  endedAt: string;
};

const UNKNOWN_USER = "Unknown user";

// Select only the fields needed for leaderboard display. Keeping the Prisma
// select small avoids fetching large result fields such as histories.
const TYPING_RESULT_SELECT = {
  user_id: true,
  wpm: true,
  raw_wpm: true,
  accuracy: true,
  consistency: true,
  ended_at: true,
} as const;

// Internal projection type for the selected TypingResults fields above.
type TypingResultProjection = {
  user_id: string;
  wpm: number | null;
  raw_wpm: number | null;
  accuracy: number | null;
  consistency: number | null;
  ended_at: Date | null;
};

type UserProfile = {
  username: string;
  profileImageUrl: string | null;
};

type LeaderboardBadge = {
  key: BadgeKey;
  name: string;
  category: BadgeCategory;
};

// Ranking order used in every leaderboard query. Higher WPM wins first, then
// higher accuracy breaks ties, then the most recent run wins if both are equal.
const LEADERBOARD_ORDER = [
  { typing_result: { wpm: "desc" as const } },
  { typing_result: { accuracy: "desc" as const } },
  { typing_result: { ended_at: "desc" as const } },
];

function typingResultStrictlyBetterWhere(wpm: number, accuracy: number, endedAt: Date) {
  // This Prisma where object is used to count how many rows rank above the
  // viewer. A row is better if it has higher WPM, or same WPM with better
  // accuracy, or same WPM/accuracy with a newer completion time.
  return {
    OR: [
      { wpm: { gt: wpm } },
      {
        AND: [{ wpm: { equals: wpm } }, { accuracy: { gt: accuracy } }],
      },
      {
        AND: [
          { wpm: { equals: wpm } },
          { accuracy: { equals: accuracy } },
          { ended_at: { gt: endedAt } },
        ],
      },
    ],
  };
}

function displayNameForUser(user: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  // Prefer Clerk username because the app uses usernames for player identity.
  // If it is missing, fall back to full name and then a safe placeholder.
  if (user.username) return user.username;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || UNKNOWN_USER;
}

async function getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  // Remove duplicates before calling Clerk, because one page may contain the
  // same user only once but this also keeps the lookup safe for reused helpers.
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) return new Map();

  const profiles = new Map<string, UserProfile>();
  try {
    // Clerk stores public profile fields such as username and image. The local
    // database only stores the Clerk user id.
    const client = await clerkClient();
    const users = await client.users.getUserList({
      userId: uniqueIds,
      limit: uniqueIds.length,
    });

    users.data.forEach((user) => {
      profiles.set(user.id, {
        username: displayNameForUser(user),
        profileImageUrl: user.imageUrl ?? null,
      });
    });
  } catch (error) {
    console.error("leaderboard getUserProfiles Clerk lookup failed:", error);
  }

  return profiles;
}

const BADGE_CATEGORIES: BadgeCategory[] = [
  "speed",
  "accuracy",
  "streak",
  "level",
  "practice",
  "special",
];

type BadgeRecord = (typeof BADGES)[number];
const BADGE_BY_KEY = new Map<BadgeKey, BadgeRecord>(
  BADGES.map((badge) => [badge.key, badge]),
);
const BADGE_RANK_BY_KEY = new Map<BadgeKey, number>(
  BADGES.map((badge, index) => [badge.key, index]),
);

function topBadgesForUser(earnedBadgeKeys: Set<BadgeKey>): LeaderboardBadge[] {
  // Pick at most one highest-ranked badge from each badge category so the
  // leaderboard row stays compact.
  return BADGE_CATEGORIES.flatMap((category) => {
    const top = BADGES.filter(
      (badge) => badge.category === category && earnedBadgeKeys.has(badge.key),
    ).sort(
      (a, b) =>
        (BADGE_RANK_BY_KEY.get(b.key) ?? 0) - (BADGE_RANK_BY_KEY.get(a.key) ?? 0),
    )[0];
    if (!top) return [];
    return [{ key: top.key, name: top.name, category: top.category }];
  });
}

async function getTopBadgesForUsers(
  userIds: string[],
): Promise<Map<string, LeaderboardBadge[]>> {
  // Query all badges for the users on this page, then group them into a Map so
  // each leaderboard row can attach its own small badge list.
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) return new Map();

  const rows = await prisma.userBadge.findMany({
    where: { user_id: { in: uniqueIds } },
    select: { user_id: true, badge_key: true },
  });

  const keysByUser = new Map<string, Set<BadgeKey>>();
  for (const row of rows) {
    if (!BADGE_BY_KEY.has(row.badge_key as BadgeKey)) continue;
    const userSet = keysByUser.get(row.user_id) ?? new Set<BadgeKey>();
    userSet.add(row.badge_key as BadgeKey);
    keysByUser.set(row.user_id, userSet);
  }

  const result = new Map<string, LeaderboardBadge[]>();
  for (const userId of uniqueIds) {
    const earned = keysByUser.get(userId) ?? new Set<BadgeKey>();
    result.set(userId, topBadgesForUser(earned));
  }
  return result;
}

function toLeaderboardRows(
  typingResults: TypingResultProjection[],
  profiles: Map<string, UserProfile>,
  topBadgesByUserId: Map<string, LeaderboardBadge[]>,
  rankStart: number
): LeaderboardRow[] {
  // Convert database projections into the exact row objects used by the UI. Rows
  // missing required score fields are filtered out before display.
  const normalized = typingResults
    .filter(
      (tr) =>
        tr.wpm != null &&
        tr.raw_wpm != null &&
        tr.accuracy != null &&
        tr.ended_at != null
    )
    .map((tr) => {
      const profile = profiles.get(tr.user_id);
      return {
        userId: tr.user_id,
        username: profile?.username ?? UNKNOWN_USER,
        profileImageUrl: profile?.profileImageUrl ?? null,
        wpm: tr.wpm as number,
        rawWpm: tr.raw_wpm as number,
        accuracy: tr.accuracy as number,
        consistency: tr.consistency,
        endedAt: (tr.ended_at as Date).toISOString(),
        topBadges: topBadgesByUserId.get(tr.user_id) ?? [],
      };
    });

  // The query already returns the rows in ranking order. rankStart turns the
  // page offset into visible ranks, for example page 2 starts at rank 21.
  return normalized.map((row, idx) => ({ ...row, rank: rankStart + idx }));
}

function clampPage(page: number, total: number): { safePage: number; totalPages: number; skip: number; take: number } {
  // Clamp pagination so callers cannot request page 0, negative pages, or pages
  // beyond the end of the leaderboard.
  const totalPages = total > 0 ? Math.ceil(total / LEADERBOARD_PAGE_SIZE) : 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * LEADERBOARD_PAGE_SIZE;
  const take = Math.min(LEADERBOARD_PAGE_SIZE, Math.max(0, total - skip));
  return { safePage, totalPages, skip, take };
}

async function dailyCutoffMetaFor60s(todayUtc: Date): Promise<DailyCutoffInfo> {
  // Count every 60s daily entry for today. If fewer than the daily max are
  // filled, there is no minimum WPM required yet.
  const slotsFilled = await prisma.leaderboardDaily60s.count({
    where: { leaderboard_date: todayUtc },
  });
  if (slotsFilled < DAILY_LEADERBOARD_MAX) {
    return { slotsFilled, cutoffWpm: null };
  }
  // When the daily board is full, fetch the last visible row. Its WPM becomes
  // the current cutoff shown to users outside the top daily list.
  const row = await prisma.leaderboardDaily60s.findMany({
    where: { leaderboard_date: todayUtc },
    orderBy: LEADERBOARD_ORDER,
    skip: DAILY_LEADERBOARD_MAX - 1,
    take: 1,
    include: { typing_result: { select: { wpm: true } } },
  });
  const wpm = row[0]?.typing_result?.wpm;
  return { slotsFilled, cutoffWpm: typeof wpm === "number" && !Number.isNaN(wpm) ? wpm : null };
}

async function dailyCutoffMetaFor15s(todayUtc: Date): Promise<DailyCutoffInfo> {
  // Same cutoff calculation for the 15s daily leaderboard.
  const slotsFilled = await prisma.leaderboardDaily15s.count({
    where: { leaderboard_date: todayUtc },
  });
  if (slotsFilled < DAILY_LEADERBOARD_MAX) {
    return { slotsFilled, cutoffWpm: null };
  }
  const row = await prisma.leaderboardDaily15s.findMany({
    where: { leaderboard_date: todayUtc },
    orderBy: LEADERBOARD_ORDER,
    skip: DAILY_LEADERBOARD_MAX - 1,
    take: 1,
    include: { typing_result: { select: { wpm: true } } },
  });
  const wpm = row[0]?.typing_result?.wpm;
  return { slotsFilled, cutoffWpm: typeof wpm === "number" && !Number.isNaN(wpm) ? wpm : null };
}

async function mapEntriesToRows(
  entries: { typing_result: TypingResultProjection }[],
  rankStart: number
): Promise<LeaderboardRow[]> {
  const userIds = entries.map((e) => e.typing_result.user_id);
  // Profile lookup and badge lookup are independent, so Promise.all runs them at
  // the same time instead of waiting for one before starting the other.
  const [profiles, topBadgesByUserId] = await Promise.all([
    getUserProfiles(userIds),
    getTopBadgesForUsers(userIds),
  ]);
  const projections = entries.map((e) => e.typing_result);
  return toLeaderboardRows(projections, profiles, topBadgesByUserId, rankStart);
}

async function queryAllTime60s(page: number): Promise<LeaderboardPagePayload> {
  // All-time 60s stores one best 60 second result per user.
  const total = await prisma.leaderboardAllTime60s.count();
  const { safePage, skip, take } = clampPage(page, total);

  // Fetch the requested page in ranking order and include the linked
  // TypingResults row where the actual score values live.
  const entries = await prisma.leaderboardAllTime60s.findMany({
    skip,
    take,
    orderBy: LEADERBOARD_ORDER,
    include: {
      typing_result: { select: TYPING_RESULT_SELECT },
    },
  });

  const rows = await mapEntriesToRows(entries, skip + 1);

  return {
    rows,
    total,
    page: safePage,
    pageSize: LEADERBOARD_PAGE_SIZE,
  };
}

async function queryAllTime15s(page: number): Promise<LeaderboardPagePayload> {
  // All-time 15s uses the same pagination and ranking logic as all-time 60s,
  // but reads from the 15 second leaderboard table.
  const total = await prisma.leaderboardAllTime15s.count();
  const { safePage, skip, take } = clampPage(page, total);

  const entries = await prisma.leaderboardAllTime15s.findMany({
    skip,
    take,
    orderBy: LEADERBOARD_ORDER,
    include: {
      typing_result: { select: TYPING_RESULT_SELECT },
    },
  });

  const rows = await mapEntriesToRows(entries, skip + 1);

  return {
    rows,
    total,
    page: safePage,
    pageSize: LEADERBOARD_PAGE_SIZE,
  };
}

async function queryDaily60s(page: number): Promise<LeaderboardPagePayload> {
  // Daily leaderboards use today's UTC date, matching the date written when the
  // typing result was saved.
  const todayUtc = utcCalendarDateFromInstant(new Date());
  const countForDate = await prisma.leaderboardDaily60s.count({
    where: { leaderboard_date: todayUtc },
  });
  // The daily UI only displays the top DAILY_LEADERBOARD_MAX rows.
  const total = Math.min(DAILY_LEADERBOARD_MAX, countForDate);
  const { safePage, skip, take } = clampPage(page, total);

  // Fetch page rows and cutoff metadata at the same time because they do not
  // depend on each other.
  const [entries, dailyCutoff] = await Promise.all([
    prisma.leaderboardDaily60s.findMany({
      where: { leaderboard_date: todayUtc },
      skip,
      take,
      orderBy: LEADERBOARD_ORDER,
      include: {
        typing_result: { select: TYPING_RESULT_SELECT },
      },
    }),
    dailyCutoffMetaFor60s(todayUtc),
  ]);

  const rows = await mapEntriesToRows(entries, skip + 1);

  return {
    rows,
    total,
    page: safePage,
    pageSize: LEADERBOARD_PAGE_SIZE,
    dailyDateUtc: todayUtc.toISOString().slice(0, 10),
    dailyCutoff,
  };
}

async function queryDaily15s(page: number): Promise<LeaderboardPagePayload> {
  // Same daily board query as 60s, but for the 15 second leaderboard table.
  const todayUtc = utcCalendarDateFromInstant(new Date());
  const countForDate = await prisma.leaderboardDaily15s.count({
    where: { leaderboard_date: todayUtc },
  });
  const total = Math.min(DAILY_LEADERBOARD_MAX, countForDate);
  const { safePage, skip, take } = clampPage(page, total);

  const [entries, dailyCutoff] = await Promise.all([
    prisma.leaderboardDaily15s.findMany({
      where: { leaderboard_date: todayUtc },
      skip,
      take,
      orderBy: LEADERBOARD_ORDER,
      include: {
        typing_result: { select: TYPING_RESULT_SELECT },
      },
    }),
    dailyCutoffMetaFor15s(todayUtc),
  ]);

  const rows = await mapEntriesToRows(entries, skip + 1);

  return {
    rows,
    total,
    page: safePage,
    pageSize: LEADERBOARD_PAGE_SIZE,
    dailyDateUtc: todayUtc.toISOString().slice(0, 10),
    dailyCutoff,
  };
}

export async function getLeaderboardPage(
  board: LeaderboardBoard,
  page: number
): Promise<LeaderboardPagePayload> {
  // Normalise unsafe page input before routing to the correct board query.
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  // The board string works like a simple router between the four leaderboard
  // tables.
  switch (board) {
    case "all_time_60s":
      return queryAllTime60s(p);
    case "all_time_15s":
      return queryAllTime15s(p);
    case "daily_60s":
      return queryDaily60s(p);
    case "daily_15s":
      return queryDaily15s(p);
  }
}

export async function getLeaderboardTopRows(
  board: LeaderboardBoard,
  take: number
): Promise<LeaderboardRow[]> {
  // Used by compact leaderboard previews, such as the landing page. The take
  // value is capped so callers cannot request too many rows.
  const n = Math.min(Math.max(1, Math.floor(take)), 100);
  const todayUtc = utcCalendarDateFromInstant(new Date());

  switch (board) {
    case "all_time_60s": {
      const entries = await prisma.leaderboardAllTime60s.findMany({
        take: n,
        orderBy: LEADERBOARD_ORDER,
        include: { typing_result: { select: TYPING_RESULT_SELECT } },
      });
      return mapEntriesToRows(entries, 1);
    }
    case "all_time_15s": {
      const entries = await prisma.leaderboardAllTime15s.findMany({
        take: n,
        orderBy: LEADERBOARD_ORDER,
        include: { typing_result: { select: TYPING_RESULT_SELECT } },
      });
      return mapEntriesToRows(entries, 1);
    }
    case "daily_60s": {
      const entries = await prisma.leaderboardDaily60s.findMany({
        where: { leaderboard_date: todayUtc },
        take: n,
        orderBy: LEADERBOARD_ORDER,
        include: { typing_result: { select: TYPING_RESULT_SELECT } },
      });
      return mapEntriesToRows(entries, 1);
    }
    case "daily_15s": {
      const entries = await prisma.leaderboardDaily15s.findMany({
        where: { leaderboard_date: todayUtc },
        take: n,
        orderBy: LEADERBOARD_ORDER,
        include: { typing_result: { select: TYPING_RESULT_SELECT } },
      });
      return mapEntriesToRows(entries, 1);
    }
  }
}

async function clerkProfileForViewer(userId: string): Promise<UserProfile> {
  try {
    // Fetch the signed-in user's display data for the highlighted "you" card.
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    return {
      username: displayNameForUser(u),
      profileImageUrl: u.imageUrl ?? null,
    };
  } catch {
    return { username: UNKNOWN_USER, profileImageUrl: null };
  }
}

function buildViewerSnapshot(params: {
  rank: number;
  total: number;
  profile: UserProfile;
  tr: {
    wpm: number;
    raw_wpm: number;
    accuracy: number;
    consistency: number | null;
    ended_at: Date;
  };
}): LeaderboardViewerSnapshot {
  const { rank, total, profile, tr } = params;
  // topPercent is based on how many users are above the viewer. Rank 1 is top
  // 0%, while the last user is shown as top 100%.
  return {
    rank,
    total,
    topPercent: total > 0 ? ((rank - 1) / total) * 100 : 0,
    username: profile.username,
    profileImageUrl: profile.profileImageUrl,
    wpm: tr.wpm,
    rawWpm: tr.raw_wpm,
    accuracy: tr.accuracy,
    consistency: tr.consistency,
    endedAt: tr.ended_at.toISOString(),
  };
}

function hasCompleteViewerTypingResult(
  tr:
    | {
        wpm: number | null;
        raw_wpm: number | null;
        accuracy: number | null;
        consistency: number | null;
        ended_at: Date | null;
      }
    | null
    | undefined
): tr is {
  // TypeScript type guard: after this returns true, the code can safely treat
  // WPM, raw WPM, accuracy and ended_at as real values.
  wpm: number;
  raw_wpm: number;
  accuracy: number;
  consistency: number | null;
  ended_at: Date;
} {
  return tr?.wpm != null && tr.raw_wpm != null && tr.accuracy != null && tr.ended_at != null;
}

async function viewerAllTime60s(userId: string, profile: UserProfile): Promise<LeaderboardViewerSnapshot | null> {
  // Find this user's stored all-time 60s row, if they have played a qualifying
  // 60 second time-mode game.
  const row = await prisma.leaderboardAllTime60s.findFirst({
    where: { user_id: userId },
    include: {
      typing_result: {
        select: { wpm: true, raw_wpm: true, accuracy: true, consistency: true, ended_at: true },
      },
    },
  });
  const tr = row?.typing_result;
  if (!hasCompleteViewerTypingResult(tr)) return null;

  // Count rows that beat this result. The viewer's rank is one more than that
  // count.
  const better = await prisma.leaderboardAllTime60s.count({
    where: { typing_result: typingResultStrictlyBetterWhere(tr.wpm, tr.accuracy, tr.ended_at) },
  });
  const total = await prisma.leaderboardAllTime60s.count();
  const rank = better + 1;
  return buildViewerSnapshot({ rank, total, profile, tr });
}

async function viewerAllTime15s(userId: string, profile: UserProfile): Promise<LeaderboardViewerSnapshot | null> {
  // Same viewer-rank calculation for the all-time 15s board.
  const row = await prisma.leaderboardAllTime15s.findFirst({
    where: { user_id: userId },
    include: {
      typing_result: {
        select: { wpm: true, raw_wpm: true, accuracy: true, consistency: true, ended_at: true },
      },
    },
  });
  const tr = row?.typing_result;
  if (!hasCompleteViewerTypingResult(tr)) return null;

  const better = await prisma.leaderboardAllTime15s.count({
    where: { typing_result: typingResultStrictlyBetterWhere(tr.wpm, tr.accuracy, tr.ended_at) },
  });
  const total = await prisma.leaderboardAllTime15s.count();
  const rank = better + 1;
  return buildViewerSnapshot({ rank, total, profile, tr });
}

async function viewerDaily60s(userId: string, profile: UserProfile): Promise<LeaderboardViewerSnapshot | null> {
  // Daily viewer rank only considers today's UTC 60s board.
  const todayUtc = utcCalendarDateFromInstant(new Date());
  const row = await prisma.leaderboardDaily60s.findFirst({
    where: { user_id: userId, leaderboard_date: todayUtc },
    include: {
      typing_result: {
        select: { wpm: true, raw_wpm: true, accuracy: true, consistency: true, ended_at: true },
      },
    },
  });
  const tr = row?.typing_result;
  if (!hasCompleteViewerTypingResult(tr)) return null;

  const better = await prisma.leaderboardDaily60s.count({
    where: {
      leaderboard_date: todayUtc,
      typing_result: typingResultStrictlyBetterWhere(tr.wpm, tr.accuracy, tr.ended_at),
    },
  });
  const total = await prisma.leaderboardDaily60s.count({
    where: { leaderboard_date: todayUtc },
  });
  const rank = better + 1;
  return buildViewerSnapshot({ rank, total, profile, tr });
}

async function viewerDaily15s(userId: string, profile: UserProfile): Promise<LeaderboardViewerSnapshot | null> {
  // Daily viewer rank only considers today's UTC 15s board.
  const todayUtc = utcCalendarDateFromInstant(new Date());
  const row = await prisma.leaderboardDaily15s.findFirst({
    where: { user_id: userId, leaderboard_date: todayUtc },
    include: {
      typing_result: {
        select: { wpm: true, raw_wpm: true, accuracy: true, consistency: true, ended_at: true },
      },
    },
  });
  const tr = row?.typing_result;
  if (!hasCompleteViewerTypingResult(tr)) return null;

  const better = await prisma.leaderboardDaily15s.count({
    where: {
      leaderboard_date: todayUtc,
      typing_result: typingResultStrictlyBetterWhere(tr.wpm, tr.accuracy, tr.ended_at),
    },
  });
  const total = await prisma.leaderboardDaily15s.count({
    where: { leaderboard_date: todayUtc },
  });
  const rank = better + 1;
  return buildViewerSnapshot({ rank, total, profile, tr });
}

export async function getViewerLeaderboardSnapshot(
  board: LeaderboardBoard,
  userId: string
): Promise<LeaderboardViewerSnapshot | null> {
  // This is the public server helper used by the leaderboard page, stats page
  // and client server action to get the signed-in user's placement.
  const profile = await clerkProfileForViewer(userId);
  switch (board) {
    case "all_time_60s":
      return viewerAllTime60s(userId, profile);
    case "all_time_15s":
      return viewerAllTime15s(userId, profile);
    case "daily_60s":
      return viewerDaily60s(userId, profile);
    case "daily_15s":
      return viewerDaily15s(userId, profile);
  }
}
