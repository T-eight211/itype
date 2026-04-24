import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StatsProfile } from "@/features/stats/server/get-stats-profile";

type StatsProfileCardProps = {
  profile: StatsProfile;
};

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "IT";
}

function formatCompactXp(value: number) {
  if (value < 1000) return value.toLocaleString("en-GB");
  const rounded = Math.round((value / 1000) * 10) / 10;
  return `${rounded.toLocaleString("en-GB", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })}k`;
}

export function StatsProfileCard({ profile }: StatsProfileCardProps) {
  const xpUntilNext = Math.max(0, profile.xpNeededForNextLevel - profile.xpIntoLevel);
  const earnedTopBadges = profile.topBadgesByCategory.filter(
    (entry) => entry.badge !== null,
  );

  return (
    <Card className="w-full overflow-hidden rounded-[28px] border-border bg-background/40 shadow-lg backdrop-blur-sm">
      <CardContent className="px-0 py-0">
        <div className="px-6 py-10 sm:px-10 sm:py-12">
        <div className="flex flex-col items-center text-center">
          <Avatar className="size-24 border border-border/40 shadow-sm sm:size-28">
            <AvatarImage src={profile.profileImageUrl ?? undefined} alt={profile.username} />
            <AvatarFallback className="bg-muted text-xl font-semibold sm:text-2xl">
              {initialsFor(profile.username)}
            </AvatarFallback>
          </Avatar>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {profile.username}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Joined {profile.joinedAtLabel}
          </p>
          {earnedTopBadges.length > 0 ? (
            <TooltipProvider delayDuration={80}>
              <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2.5">
                {earnedTopBadges.map(({ category, badge }) => {
                  if (!badge) return null;

                  return (
                    <Tooltip key={`${category}-${badge.key}`}>
                      <TooltipTrigger asChild>
                        <Badge
                          className={`cursor-default border ${badgeCategoryClassName(category)}`}
                        >
                          {badge.name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={6}>
                        <p>{badge.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          ) : null}
          <div className="mt-6 w-full max-w-md rounded-2xl border border-border/50 bg-muted/20 px-4 py-4 text-left">
            <div className="mb-2 flex items-center justify-between">
              <HoverCard openDelay={50} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <span className="cursor-default text-sm text-muted-foreground">Level {profile.level}</span>
                </HoverCardTrigger>
                <HoverCardContent className="w-fit px-3 py-2">
                  <span className="text-sm font-mono">
                    {profile.totalXp.toLocaleString("en-GB")} total xp
                  </span>
                </HoverCardContent>
              </HoverCard>
              <HoverCard openDelay={50} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <span className="cursor-default text-sm font-mono text-muted-foreground">
                    {formatCompactXp(profile.xpIntoLevel)} / {formatCompactXp(profile.xpNeededForNextLevel)}
                  </span>
                </HoverCardTrigger>
                <HoverCardContent className="w-fit px-3 py-2">
                  <span className="text-sm font-mono">
                    {xpUntilNext.toLocaleString("en-GB")} xp until next level
                  </span>
                </HoverCardContent>
              </HoverCard>
            </div>
            <HoverCard openDelay={50} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div>
                  <Progress value={profile.xpProgressPercent} className="h-2.5" />
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-fit px-3 py-2">
                <span className="text-sm font-mono">{profile.xpProgressPercent}% progress</span>
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
        </div>

        <div className="grid border-t border-border/50 bg-muted/20 sm:grid-cols-3">
          <StatBlock value={profile.testsCompleted.toLocaleString("en-GB")} label="Tests completed" />
          <StatBlock value={profile.timeTypingLabel} label="Time typing" withBorder />
          <StatBlock value={profile.joinedAtLabel} label="Member since" withBorderOnDesktop />
        </div>
      </CardContent>
    </Card>
  );
}

function formatCategoryLabel(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function badgeCategoryClassName(category: string) {
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

function StatBlock({
  value,
  label,
  withBorder,
  withBorderOnDesktop,
}: {
  value: string;
  label: string;
  withBorder?: boolean;
  withBorderOnDesktop?: boolean;
}) {
  return (
    <div
      className={[
        "flex min-h-32 flex-col items-center justify-center px-6 py-8 text-center",
        withBorder ? "border-t border-border/50 sm:border-t-0 sm:border-l" : "",
        withBorderOnDesktop ? "border-t border-border/50 sm:border-t-0 sm:border-l" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground sm:text-base">{label}</div>
    </div>
  );
}
