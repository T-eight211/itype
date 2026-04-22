"use client";

import React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const DAY_SIZE = "16px";
const DAY_MARGIN = "2px";
const heatmapClassNames = {
  zero: "bg-gray-100",
  one: "bg-red-200",
  two: "bg-red-400",
  three: "bg-red-600",
  four: "bg-red-800",
};

export interface CalendarHeatmapData {
  date: Date;
  count: number;
}

type HeatmapDay = {
  date: Date;
  key: string;
  count: number | null;
};

type MonthLabel = {
  key: string;
  label: string;
  column: number;
};

type HeatmapRange = "last-12-months" | "2026";

interface CalendarHeatmapProps {
  data: CalendarHeatmapData[];
}

const rangeLabels: Record<HeatmapRange, string> = {
  "last-12-months": "Last 12 months",
  "2026": "2026",
};
const weekdayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

export default function CalendarHeatmap({
  data,
}: CalendarHeatmapProps): React.JSX.Element {
  const [range, setRange] = React.useState<HeatmapRange>("last-12-months");
  const { days, monthLabels, weekCount } = buildHeatmap(data, range);

  return (
    <div
      className="flex-cols rounded-md border px-3 pb-3"
      style={
        {
          "--box-size": DAY_SIZE,
          "--box-margin": DAY_MARGIN,
        } as React.CSSProperties
      }
    >
      <div className="flex justify-end py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="min-w-40 justify-between"
              size="sm"
              type="button"
              variant="outline"
            >
              {rangeLabels[range]}
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuRadioGroup
              value={range}
              onValueChange={(value) => setRange(value as HeatmapRange)}
            >
              <DropdownMenuRadioItem value="last-12-months">
                Last 12 months
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="2026">2026</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
        <div />
        <div className="overflow-x-auto" style={{ gridColumn: 2, gridRow: "1 / span 2" }}>
          <TooltipProvider delayDuration={100}>
            <div
              className="grid w-fit gap-[var(--box-margin)] pt-1"
              style={{
                gridTemplateColumns: `repeat(${weekCount}, var(--box-size))`,
              }}
            >
              {monthLabels.map((month) => (
                <div
                  key={month.key}
                  className="text-xs font-normal text-foreground"
                  style={{ gridColumn: `${month.column + 1} / span 4` }}
                >
                  {month.label}
                </div>
              ))}
            </div>
            <div
              className="grid w-fit grid-flow-col grid-rows-7 gap-[var(--box-margin)] pt-1"
              role="grid"
              style={{
                gridTemplateColumns: `repeat(${weekCount}, var(--box-size))`,
              }}
            >
              {days.map((day) => (
                <HeatmapCell key={day.key} day={day} />
              ))}
            </div>
          </TooltipProvider>
        </div>
        <div
          className="grid grid-rows-7 gap-[var(--box-margin)] pt-1 text-xs text-muted-foreground"
          style={{ gridRow: 2 }}
        >
          {weekdayLabels.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="flex h-[var(--box-size)] items-center justify-end"
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end pr-4">
        <HeatmapLegend />
      </div>
    </div>
  );
}

function HeatmapLegend(): React.JSX.Element {
  return (
    <div className="flex space-x-2 text-sm text-gray-600">
      <span>less</span>
      <div className="flex items-center space-x-1">
        <div
          className={cn(
            "w-[var(--box-size)] h-[var(--box-size)] rounded-sm",
            heatmapClassNames.zero
          )}
        ></div>
        <div
          className={cn(
            "w-[var(--box-size)] h-[var(--box-size)] rounded-sm",
            heatmapClassNames.one
          )}
        ></div>
        <div
          className={cn(
            "w-[var(--box-size)] h-[var(--box-size)] rounded-sm",
            heatmapClassNames.two
          )}
        ></div>
        <div
          className={cn(
            "w-[var(--box-size)] h-[var(--box-size)] rounded-sm",
            heatmapClassNames.three
          )}
        ></div>
        <div
          className={cn(
            "w-[var(--box-size)] h-[var(--box-size)] rounded-sm",
            heatmapClassNames.four
          )}
        ></div>
      </div>
      <span>more</span>
    </div>
  );
}

function HeatmapCell({ day }: { day: HeatmapDay }): React.JSX.Element {
  if (day.count === null) {
    return (
      <div
        className="h-[var(--box-size)] w-[var(--box-size)]"
        role="presentation"
      />
    );
  }

  return (
    <Tooltip>
      <TooltipContent>{`${day.count || "No"} activities on ${day.date.toDateString()}`}</TooltipContent>
      <TooltipTrigger asChild>
        <div
          aria-label={`${day.count || "No"} activities on ${day.date.toDateString()}`}
          className={cn(
            "h-[var(--box-size)] w-[var(--box-size)] cursor-default rounded-sm border text-xs text-transparent",
            getHeatmapClassName(day.count)
          )}
          role="gridcell"
        />
      </TooltipTrigger>
    </Tooltip>
  );
}

function buildHeatmap(data: CalendarHeatmapData[], range: HeatmapRange) {
  const today = startOfDay(new Date());
  const rangeStart = getRangeStart(range, today);
  const rangeEnd = getRangeEnd(range);
  const start = startOfWeek(rangeStart);
  const dataByDay = new Map(
    data.map((item) => [dateKey(item.date), item.count])
  );
  const days: HeatmapDay[] = [];

  for (
    const date = new Date(start);
    date <= rangeEnd;
    date.setDate(date.getDate() + 1)
  ) {
    const currentDate = new Date(date);
    const key = dateKey(currentDate);
    days.push({
      date: currentDate,
      key,
      count:
        currentDate < rangeStart && range === "2026"
          ? null
          : dataByDay.get(key) ?? 0,
    });
  }

  const weekCount = Math.ceil(days.length / 7);

  while (days.length < weekCount * 7) {
    const lastDate = days[days.length - 1].date;
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + 1);
    days.push({
      date: nextDate,
      key: dateKey(nextDate),
      count: null,
    });
  }

  const monthLabels = getMonthLabels(
    days,
    rangeStart,
    rangeEnd,
    range === "last-12-months"
  );

  return { days, monthLabels, weekCount };
}

function getRangeStart(range: HeatmapRange, today: Date) {
  if (range === "2026") {
    return new Date(2026, 0, 1);
  }

  const lastTwelveMonthsStart = new Date(today);
  lastTwelveMonthsStart.setMonth(lastTwelveMonthsStart.getMonth() - 12);
  return lastTwelveMonthsStart;
}

function getRangeEnd(range: HeatmapRange) {
  if (range === "2026") {
    return new Date(2026, 11, 31);
  }

  return startOfDay(new Date());
}

function getMonthLabels(
  days: HeatmapDay[],
  labelStart: Date,
  labelEnd: Date,
  skipFirstLabel = false
): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let previousMonth = -1;
  let skippedFirstLabel = false;

  days.forEach((day, index) => {
    if (day.date < labelStart || day.date > labelEnd) {
      return;
    }

    const month = day.date.getMonth();

    if (month !== previousMonth) {
      if (skipFirstLabel && !skippedFirstLabel) {
        skippedFirstLabel = true;
        previousMonth = month;
        return;
      }

      labels.push({
        key: `${day.date.getFullYear()}-${month}`,
        label: day.date.toLocaleString("default", { month: "short" }),
        column: Math.floor(index / 7),
      });
      previousMonth = month;
    }
  });

  return labels;
}

function getHeatmapClassName(count: number) {
  if (count === 1) {
    return heatmapClassNames.one;
  }

  if (count === 2) {
    return heatmapClassNames.two;
  }

  if (count === 3) {
    return heatmapClassNames.three;
  }

  if (count >= 4) {
    return heatmapClassNames.four;
  }

  return heatmapClassNames.zero;
}

function startOfWeek(date: Date) {
  const nextDate = startOfDay(date);
  const dayOffset = (nextDate.getDay() + 6) % 7;
  nextDate.setDate(nextDate.getDate() - dayOffset);
  return nextDate;
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
