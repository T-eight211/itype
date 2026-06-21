// This file was adapted from the 21st.dev community created by Isaiah (@isaiahbjork):
// https://21st.dev/community/components/isaiahbjork/server-management-table/default

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Medal, Timer, Trophy, X } from "lucide-react";
import { fetchLeaderboardPage } from "@/features/leaderboard/actions/fetch-leaderboard-page";
import { fetchViewerLeaderboardSnapshot } from "@/features/leaderboard/actions/fetch-viewer-leaderboard-snapshot";
import { DAILY_LEADERBOARD_MAX, LEADERBOARD_PAGE_SIZE } from "@/features/leaderboard/constants";
import type {
  DailyCutoffInfo,
  LeaderboardBoard,
  LeaderboardRow,
  LeaderboardViewerSnapshot,
} from "@/features/leaderboard/server/get-leaderboards";
import {
  getPaginationItems,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ServerManagementTableProps {
  title?: string;
  initialBoard?: LeaderboardBoard;
  initialRows: LeaderboardRow[];
  initialTotal: number;
  initialPage: number;
  viewerUserId: string;
  initialViewer: LeaderboardViewerSnapshot | null;
  className?: string;
}

const BOARD_LABELS: Record<LeaderboardBoard, string> = {
  // Human-readable labels for the four board ids returned by the server.
  all_time_60s: "All-time 60s",
  all_time_15s: "All-time 15s",
  daily_60s: "Daily 60s",
  daily_15s: "Daily 15s",
};

// The order used to render the board selector buttons.
const BOARD_LIST: LeaderboardBoard[] = [
  "all_time_60s",
  "all_time_15s",
  "daily_60s",
  "daily_15s",
];

function formatScore(value: number | null): string {
  // Score fields can be null while data is missing, so show a safe placeholder.
  if (value == null || Number.isNaN(value)) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number | null): string {
  // Accuracy is displayed as a percentage with two decimal places.
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(2)}%`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatLocalDateTime(value: string): string {
  // Server sends ISO timestamps. The UI converts them into the user's local
  // browser time for display.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const day = d.getDate();
  const mon = SHORT_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon} ${year} ${h}:${min}`;
}

function ordinalDay(n: number): string {
  // Adds st/nd/rd/th for the UTC daily leaderboard date label.
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function formatUtcCalendarDateLabel(isoDate: string): string {
  // Daily leaderboards reset by UTC date, so this label is forced to UTC rather
  // than the user's local timezone.
  const [y, mo, d] = isoDate.split("-").map(Number);
  if (!y || !mo || !d) return isoDate;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const weekday = dt.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${weekday} ${ordinalDay(d)} ${month} ${y} UTC`;
}

function msUntilNextUtcMidnight(): number {
  // Calculate how many milliseconds are left before the next UTC daily reset.
  const now = Date.now();
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next - now);
}

function formatCountdown(ms: number): string {
  // Convert milliseconds into HH:MM:SS for the daily reset timer.
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function DailyNextResetCountdown() {
  // React state stores the live countdown value. Updating state every second
  // causes this small component to re-render with the new time.
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    // useEffect starts the browser interval after the component appears and
    // clears it when the component is removed.
    const tick = () => setMsLeft(msUntilNextUtcMidnight());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex w-full justify-end sm:w-auto sm:justify-start items-center gap-2 text-sm text-muted-foreground shrink-0">
      <Timer className="size-4 shrink-0 opacity-80" aria-hidden />
      <span>
        Next reset in{" "}
        <span className="font-mono tabular-nums text-foreground">{formatCountdown(msLeft)}</span> UTC
      </span>
    </div>
  );
}

function rankColor(rank: number): string {
  // Top three ranks get distinct colours; all other ranks use muted text.
  if (rank == 1) return "text-yellow-400";
  if (rank == 2) return "text-slate-300";
  if (rank == 3) return "text-orange-300";
  return "text-muted-foreground";
}

function avatarFallback(username: string): string {
  // If Clerk has no profile image, show the first letter of the username.
  return username.trim().charAt(0).toUpperCase() || "?";
}

function formatTopPercentLabel(rank: number, total: number): string {
  // Shows where the viewer sits compared with the full board.
  if (total <= 0) return "0";
  if (rank === 1) return "0";
  if (rank === total) return "100";
  return (((rank - 1) / total) * 100).toFixed(2);
}

function badgeCategoryClassName(category: string) {
  // Map badge categories to Tailwind colour classes for compact badge chips.
  switch (category) {
    case "speed":
      return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "accuracy":
      return "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300";
    case "streak":
      return "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    case "level":
      return "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
    case "practice":
      return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
    case "special":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    default:
      return "bg-muted text-foreground";
  }
}

function ViewerCardIdentity({ viewer }: { viewer: LeaderboardViewerSnapshot }) {
  // Small reusable identity block used in viewer states, especially when the
  // user is outside the daily cutoff.
  return (
    <div className="flex items-center gap-4 min-w-0">
      {viewer.profileImageUrl ? (
        <img
          src={viewer.profileImageUrl}
          alt=""
          className="size-14 shrink-0 rounded-full border border-border/40 object-cover"
        />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted text-lg font-semibold">
          {avatarFallback(viewer.username)}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">You</p>
        <p className="truncate text-lg font-semibold text-foreground">{viewer.username}</p>
      </div>
    </div>
  );
}

export function ServerManagementTable({
  title = "Leaderboard",
  initialBoard = "all_time_60s",
  initialRows,
  initialTotal,
  initialPage,
  viewerUserId,
  initialViewer,
  className = "",
}: ServerManagementTableProps) {
  // React state controls the active board, current page and rows currently shown
  // on screen. Calling each setter re-renders this component with new data.
  const [activeBoard, setActiveBoard] = useState<LeaderboardBoard>(initialBoard);
  const [page, setPage] = useState(initialPage);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  // Daily metadata is only returned for daily boards.
  const [dailyCutoff, setDailyCutoff] = useState<DailyCutoffInfo | null>(null);
  const [dailyDateUtc, setDailyDateUtc] = useState<string | null>(null);
  // viewer stores the signed-in user's rank snapshot for the selected board.
  const [viewer, setViewer] = useState<LeaderboardViewerSnapshot | null>(initialViewer);
  const [viewerLoading, setViewerLoading] = useState(false);
  // selectedRow opens the detail overlay. Null means no overlay is open.
  const [selectedRow, setSelectedRow] = useState<LeaderboardRow | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // useTransition marks board/page changes as non-urgent UI updates, allowing
  // React to keep the interface responsive while the server action returns.
  const [pending, startTransition] = useTransition();
  const shouldReduceMotion = useReducedMotion();
  // Refs keep mutable flags without causing a re-render. They prevent duplicate
  // fetches for data already loaded by the server on the first page render.
  const skipInitialFetch = useRef(false);
  const skipViewerFetch = useRef(false);

  useEffect(() => {
    // Refetch leaderboard rows whenever the user changes board or page. The
    // first render is skipped because initialRows already came from the server.
    if (!skipInitialFetch.current) {
      skipInitialFetch.current = true;
      return;
    }
    startTransition(() => {
      void fetchLeaderboardPage(activeBoard, page).then((r) => {
        setRows(r.rows);
        setTotal(r.total);
        setPage(r.page);
        setDailyCutoff(r.dailyCutoff ?? null);
        setDailyDateUtc(r.dailyDateUtc ?? null);
      });
    });
  }, [activeBoard, page]);

  useEffect(() => {
    // Refetch the signed-in user's placement when the selected board changes.
    // This is separate from row fetching because the viewer may not be on the
    // current visible page.
    if (!viewerUserId) return;
    if (skipViewerFetch.current) {
      skipViewerFetch.current = false;
      return;
    }
    queueMicrotask(() => setViewerLoading(true));
    void fetchViewerLeaderboardSnapshot(activeBoard, viewerUserId).then((v) => {
      setViewer(v);
      setViewerLoading(false);
    });
  }, [activeBoard, viewerUserId]);

  const totalPages = total > 0 ? Math.ceil(total / LEADERBOARD_PAGE_SIZE) : 1;
  const pageItems = getPaginationItems(page, totalPages);
  // Daily boards show the UTC date and reset countdown. All-time boards do not.
  const isDaily = activeBoard === "daily_60s" || activeBoard === "daily_15s";

  return (
    <div className={`w-full max-w-7xl mx-auto p-6 ${className}`}>
      <div className="relative border border-border/30 rounded-2xl p-6 bg-card">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h1 className="text-xl font-medium text-foreground">{title}</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                {BOARD_LABELS[activeBoard]}
                {isDaily ? (
                  <>
                    {" "}
                    • {dailyDateUtc ? formatUtcCalendarDateLabel(dailyDateUtc) : "…"}
                  </>
                ) : null}
              </div>
            </div>
            {isDaily ? <DailyNextResetCountdown /> : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Board selector. Changing board resets to page 1 and clears any open row detail. */}
            {BOARD_LIST.map((board) => {
              const active = board == activeBoard;
              return (
                <button
                  key={board}
                  type="button"
                  onClick={() => {
                    setSelectedRow(null);
                    if (board === activeBoard) return;
                    setDailyCutoff(null);
                    setActiveBoard(board);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    active
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-muted/50 border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {BOARD_LABELS[board]}
                </button>
              );
            })}
          </div>
        </div>

        {viewerUserId ? (
          <div className="mb-6">
            {/* Viewer placement area: loading, no qualifying entry, outside daily cutoff, or highlighted rank card. */}
            {viewerLoading ? (
              <p className="text-sm text-muted-foreground">Loading your placement…</p>
            ) : !viewer ? (
              <p className="text-sm text-muted-foreground">
                No entry on this leaderboard yet. Play a qualifying run to appear here.
              </p>
            ) : isDaily &&
              viewer.rank > DAILY_LEADERBOARD_MAX &&
              dailyCutoff?.cutoffWpm != null ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <ViewerCardIdentity viewer={viewer} />
                <p className="text-sm text-foreground sm:text-right">
                  Not qualified (min speed required:{" "}
                  <span className="font-mono font-semibold">
                    {dailyCutoff.cutoffWpm.toFixed(2)} wpm
                  </span>
                  )
                </p>
              </div>
            ) : isDaily && viewer.rank > DAILY_LEADERBOARD_MAX && dailyCutoff == null ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <ViewerCardIdentity viewer={viewer} />
                <p className="text-sm text-muted-foreground sm:text-right">Loading cutoff…</p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-primary bg-primary/20 p-4">
                <div
                  className="absolute inset-0 bg-linear-to-l from-primary/10 to-transparent pointer-events-none"
                  style={{
                    backgroundSize: "35% 100%",
                    backgroundPosition: "right",
                    backgroundRepeat: "no-repeat",
                    opacity: 0.55,
                  }}
                />

                <div className="relative grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1">
                    <div className="flex flex-col leading-none">
                      <span className={`text-2xl font-bold ${rankColor(viewer.rank)}`}>
                        {viewer.rank}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Top{" "}
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {formatTopPercentLabel(viewer.rank, viewer.total)}%
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    {viewer.profileImageUrl ? (
                      <img
                        src={viewer.profileImageUrl}
                        alt={viewer.username}
                        className="w-9 h-9 rounded-full border border-border/40 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full border border-border/40 bg-muted flex items-center justify-center shrink-0 text-sm font-semibold">
                        {avatarFallback(viewer.username)}
                      </div>
                    )}
                    <span className="text-foreground font-medium truncate">{viewer.username}</span>
                    <span className="shrink-0 rounded-md border border-primary/50 bg-primary/25 px-2 py-0.5 text-xs font-semibold text-primary">
                      You
                    </span>
                  </div>

                  <div className="col-span-1 text-foreground font-mono font-medium">{formatScore(viewer.wpm)}</div>
                  <div className="col-span-1 text-foreground font-mono font-medium">{formatScore(viewer.rawWpm)}</div>
                  <div className="col-span-2 text-foreground font-mono">{formatPercent(viewer.accuracy)}</div>
                  <div className="col-span-2 text-foreground font-mono">{formatScore(viewer.consistency)}</div>
                  <div className="col-span-2 text-foreground text-sm">{formatLocalDateTime(viewer.endedAt)}</div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <motion.div
          className={cn("space-y-2", pending && "pointer-events-none opacity-60")}
          variants={{
            visible: {
              transition: {
                staggerChildren: shouldReduceMotion ? 0 : 0.05,
                delayChildren: shouldReduceMotion ? 0 : 0.05,
              },
            },
          }}
          initial="hidden"
          animate="visible"
        >
          {/* Column header for the leaderboard rows. */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-1">Rank</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-1">WPM</div>
            <div className="col-span-1">Raw</div>
            <div className="col-span-2">Accuracy</div>
            <div className="col-span-2">Consistency</div>
            <div className="col-span-2">Date &amp; Time</div>
          </div>

          {rows.length == 0 ? (
            // Empty state for a board with no saved qualifying scores.
            <div className="rounded-xl border border-border/40 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              No leaderboard entries yet.
            </div>
          ) : (
            rows.map((row) => {
              // Highlight the signed-in user's row when it appears in the visible
              // page results.
              const isYou =
                Boolean(viewerUserId) && row.userId.trim() === viewerUserId.trim();
              return (
              <motion.div
                key={`${activeBoard}-${row.userId}-${row.rank}`}
                variants={{
                  hidden: {
                    opacity: 0,
                    x: -20,
                    scale: 0.98,
                    filter: "blur(3px)",
                  },
                  visible: {
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    filter: "blur(0px)",
                    transition: {
                      type: "spring",
                      stiffness: 360,
                      damping: 26,
                      mass: 0.7,
                    },
                  },
                }}
                className={cn(
                  "relative cursor-pointer rounded-xl",
                  isYou && "z-1 ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
                data-current-user={isYou ? "true" : undefined}
                aria-current={isYou ? "true" : undefined}
                onMouseEnter={() => setHoveredId(row.userId)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => setSelectedRow(row)}
              >
                <motion.div
                  className={cn(
                    "relative rounded-xl border p-4 overflow-hidden",
                    isYou
                      ? "border-primary bg-primary/20"
                      : "border-border/50 bg-muted/50",
                  )}
                  whileHover={{
                    y: -1,
                    transition: { type: "spring", stiffness: 380, damping: 24 },
                  }}
                >
                  <div
                    className="absolute inset-0 bg-linear-to-l from-primary/10 to-transparent pointer-events-none"
                    style={{
                      backgroundSize: "35% 100%",
                      backgroundPosition: "right",
                      backgroundRepeat: "no-repeat",
                      opacity: hoveredId == row.userId ? 1 : isYou ? 0.55 : 0.4,
                    }}
                  />

                  <div className="relative grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-1">
                      <span className={`text-2xl font-bold ${rankColor(row.rank)}`}>{row.rank}</span>
                    </div>

                    <div className="col-span-3 flex items-center gap-3 min-w-0">
                      {row.profileImageUrl ? (
                        <img
                          src={row.profileImageUrl}
                          alt={row.username}
                          className="w-9 h-9 rounded-full border border-border/40 object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full border border-border/40 bg-muted flex items-center justify-center shrink-0 text-sm font-semibold">
                          {avatarFallback(row.username)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium truncate">{row.username}</span>
                          {isYou ? (
                            // Extra label makes the current user's own row easy to identify.
                            <span className="shrink-0 rounded-md border border-primary/50 bg-primary/25 px-2 py-0.5 text-xs font-semibold text-primary">
                              You
                            </span>
                          ) : null}
                        </div>
                        {row.topBadges.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {row.topBadges.slice(0, 3).map((badge) => (
                              <Badge
                                key={`${row.userId}-${badge.key}`}
                                className={`border px-2 py-0 text-[10px] ${badgeCategoryClassName(badge.category)}`}
                              >
                                {badge.name}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-1 text-foreground font-mono font-medium">{formatScore(row.wpm)}</div>
                    <div className="col-span-1 text-foreground font-mono font-medium">{formatScore(row.rawWpm)}</div>
                    <div className="col-span-2 text-foreground font-mono">{formatPercent(row.accuracy)}</div>
                    <div className="col-span-2 text-foreground font-mono">{formatScore(row.consistency)}</div>
                    <div className="col-span-2 text-foreground text-sm">{formatLocalDateTime(row.endedAt)}</div>
                  </div>
                </motion.div>
              </motion.div>
              );
            })
          )}
        </motion.div>

        {total > 0 && (
          // Pagination changes React state, which triggers the useEffect above to
          // request the next leaderboard page from the server action.
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  disabled={page <= 1 || pending}
                  onClick={() => page > 1 && setPage((p) => p - 1)}
                />
              </PaginationItem>
              {pageItems.map((item, i) =>
                item === "ellipsis" ? (
                  <PaginationItem key={`e-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      size="icon"
                      isActive={item === page}
                      disabled={pending}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  disabled={page >= totalPages || pending}
                  onClick={() => page < totalPages && setPage((p) => p + 1)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        <AnimatePresence>
          {selectedRow && (
            // Clicking a row stores it in selectedRow and opens this overlay with
            // more detail about the saved result.
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col rounded-2xl z-10 overflow-hidden"
            >
              <div className="relative bg-linear-to-r from-muted/50 to-transparent p-4 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`text-2xl font-bold ${rankColor(selectedRow.rank)}`}>#{selectedRow.rank}</div>
                  {selectedRow.profileImageUrl ? (
                    <img
                      src={selectedRow.profileImageUrl}
                      alt={selectedRow.username}
                      className="w-10 h-10 rounded-full border border-border/40 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full border border-border/40 bg-muted flex items-center justify-center text-sm font-semibold">
                      {avatarFallback(selectedRow.username)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-foreground truncate">{selectedRow.username}</h3>
                    <p className="text-sm text-muted-foreground">{BOARD_LABELS[activeBoard]}</p>
                  </div>
                </div>

                <motion.button
                  className="w-8 h-8 bg-background/80 hover:bg-background rounded-full flex items-center justify-center border border-border/50"
                  onClick={() => setSelectedRow(null)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">WPM</label>
                    <div className="text-lg font-mono font-semibold mt-1">{formatScore(selectedRow.wpm)}</div>
                  </div>

                  <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Raw WPM</label>
                    <div className="text-lg font-mono font-semibold mt-1">{formatScore(selectedRow.rawWpm)}</div>
                  </div>

                  <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Accuracy</label>
                    <div className="text-lg font-mono font-semibold mt-1">{formatPercent(selectedRow.accuracy)}</div>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Consistency</label>
                  <div className="text-sm font-mono text-foreground">{formatScore(selectedRow.consistency)}</div>
                </div>

                <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Date &amp; Time (Local)</label>
                  <div className="text-sm text-foreground flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-muted-foreground" />
                    <span>{formatLocalDateTime(selectedRow.endedAt)}</span>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Placement</label>
                  <div className="text-sm text-foreground flex items-center gap-2">
                    {selectedRow.rank == 1 ? (
                      <Trophy className="w-4 h-4 text-yellow-400" />
                    ) : (
                      <Medal className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span>
                      Rank #{selectedRow.rank} in {BOARD_LABELS[activeBoard]}
                    </span>
                  </div>
                </div>
                {selectedRow.topBadges.length > 0 ? (
                  <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Badges</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedRow.topBadges.map((badge) => (
                        <Badge
                          key={`${selectedRow.userId}-${badge.key}`}
                          className={`border ${badgeCategoryClassName(badge.category)}`}
                        >
                          {badge.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
