import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { utcCalendarDateFromInstant } from "@/features/typing-game/server/upsert-daily-leaderboards";
import {
  DAILY_LEADERBOARD_MAX,
  LEADERBOARD_PAGE_SIZE,
} from "@/features/leaderboard/constants";

export type LeaderboardBoard =
  | "all_time_60s"
  | "all_time_15s"
  | "daily_60s"
  | "daily_15s";

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
};

export { DAILY_LEADERBOARD_MAX, LEADERBOARD_PAGE_SIZE } from "@/features/leaderboard/constants";

export type DailyCutoffInfo = {
  slotsFilled: number;
  cutoffWpm: number | null;
};

export type LeaderboardPagePayload = {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  dailyDateUtc?: string;
  dailyCutoff?: DailyCutoffInfo;
};

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

const TYPING_RESULT_SELECT = {
  user_id: true,
  wpm: true,
  raw_wpm: true,
  accuracy: true,
  consistency: true,
  ended_at: true,
} as const;

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

const LEADERBOARD_ORDER = [
  { typing_result: { wpm: "desc" as const } },
  { typing_result: { accuracy: "desc" as const } },
  { typing_result: { ended_at: "desc" as const } },
];

function typingResultStrictlyBetterWhere(wpm: number, accuracy: number, endedAt: Date) {
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
  if (user.username) return user.username;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || UNKNOWN_USER;
}

async function getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) return new Map();

  const profiles = new Map<string, UserProfile>();
  try {
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

function toLeaderboardRows(
  typingResults: TypingResultProjection[],
  profiles: Map<string, UserProfile>,
  rankStart: number
): LeaderboardRow[] {
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
      };
    });

  return normalized.map((row, idx) => ({ ...row, rank: rankStart + idx }));
}

function clampPage(page: number, total: number): { safePage: number; totalPages: number; skip: number; take: number } {
  const totalPages = total > 0 ? Math.ceil(total / LEADERBOARD_PAGE_SIZE) : 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * LEADERBOARD_PAGE_SIZE;
  const take = Math.min(LEADERBOARD_PAGE_SIZE, Math.max(0, total - skip));
  return { safePage, totalPages, skip, take };
}

async function dailyCutoffMetaFor60s(todayUtc: Date): Promise<DailyCutoffInfo> {
  const slotsFilled = await prisma.leaderboardDaily60s.count({
    where: { leaderboard_date: todayUtc },
  });
  if (slotsFilled < DAILY_LEADERBOARD_MAX) {
    return { slotsFilled, cutoffWpm: null };
  }
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
  const profiles = await getUserProfiles(userIds);
  const projections = entries.map((e) => e.typing_result);
  return toLeaderboardRows(projections, profiles, rankStart);
}

async function queryAllTime60s(page: number): Promise<LeaderboardPagePayload> {
  const total = await prisma.leaderboardAllTime60s.count();
  const { safePage, skip, take } = clampPage(page, total);

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
  const todayUtc = utcCalendarDateFromInstant(new Date());
  const countForDate = await prisma.leaderboardDaily60s.count({
    where: { leaderboard_date: todayUtc },
  });
  const total = Math.min(DAILY_LEADERBOARD_MAX, countForDate);
  const { safePage, skip, take } = clampPage(page, total);

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
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

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

async function clerkProfileForViewer(userId: string): Promise<UserProfile> {
  try {
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
  wpm: number;
  raw_wpm: number;
  accuracy: number;
  consistency: number | null;
  ended_at: Date;
} {
  return tr?.wpm != null && tr.raw_wpm != null && tr.accuracy != null && tr.ended_at != null;
}

async function viewerAllTime60s(userId: string, profile: UserProfile): Promise<LeaderboardViewerSnapshot | null> {
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

  const better = await prisma.leaderboardAllTime60s.count({
    where: { typing_result: typingResultStrictlyBetterWhere(tr.wpm, tr.accuracy, tr.ended_at) },
  });
  const total = await prisma.leaderboardAllTime60s.count();
  const rank = better + 1;
  return buildViewerSnapshot({ rank, total, profile, tr });
}

async function viewerAllTime15s(userId: string, profile: UserProfile): Promise<LeaderboardViewerSnapshot | null> {
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
