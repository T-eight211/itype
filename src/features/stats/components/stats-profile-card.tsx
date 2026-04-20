import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
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

export function StatsProfileCard({ profile }: StatsProfileCardProps) {
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
