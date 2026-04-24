"use client";

import {
  lookupQwertyFinger,
  type Finger,
  type QwertyFingerInfo,
} from "@/features/typing-game/lib/qwerty-finger-lookup";
import { cn } from "@/lib/utils";

const HAND_W = 280;

const HAND_H = 165;


const KEY_STEP_PX = 58;


const FINGER_X: Record<"pinky" | "ring" | "middle" | "index", number> = {
  pinky: 24,
  ring: 82,
  middle: 140,
  index: 198,
};

const FINGER_TOP_Y: Record<"pinky" | "ring" | "middle" | "index", number> = {
  pinky: 40,
  ring: 24,
  middle: 12,
  index: 22,
};

const FINGER_BOTTOM_Y = 105;
const FINGER_W = 26;

const PALM = { x: 6, y: 100, w: 210, h: 60, rx: 30 } as const;

const THUMB = {
  x: 188,
  y: 118,
  w: 72,
  h: 24,
  rx: 12,
  rotate: { angle: -18, cx: 224, cy: 130 },
} as const;

const HOME_ROW_TOP_NO_NUMBER = 4 + 48 + 10;
const HOME_ROW_TOP_WITH_NUMBER = HOME_ROW_TOP_NO_NUMBER + 48 + 10;

const LEFT_HAND_LEFT = 52;
const RIGHT_HAND_LEFT = 342;


const HOME_POS: Record<"left" | "right", Record<Finger, { x: number; y: number }>> = {
  left: {
    pinky: { x: 0.5, y: 1 },
    ring: { x: 1.5, y: 1 },
    middle: { x: 2.5, y: 1 },
    index: { x: 3.5, y: 1 },
    thumb: { x: 5.5, y: 3 },
  },
  right: {
    pinky: { x: 9.5, y: 1 },
    ring: { x: 8.5, y: 1 },
    middle: { x: 7.5, y: 1 },
    index: { x: 6.5, y: 1 },
    thumb: { x: 5.5, y: 3 },
  },
};

type Side = "left" | "right";
type Delta = { dx: number; dy: number };

function FingerGroup({
  finger,
  active,
  delta,
}: {
  finger: "pinky" | "ring" | "middle" | "index";
  active: boolean;
  delta: Delta | null;
}) {
  const cx = FINGER_X[finger];
  const top = FINGER_TOP_Y[finger];
  const transform =
    active && delta != null && (delta.dx !== 0 || delta.dy !== 0)
      ? `translate(${delta.dx} ${delta.dy})`
      : undefined;
  return (
    <g
      data-finger={finger}
      transform={transform}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      className="transition-transform duration-150 ease-out motion-reduce:transition-none"
    >
      <rect
        x={cx - FINGER_W / 2}
        y={top}
        width={FINGER_W}
        height={FINGER_BOTTOM_Y - top + 10}
        rx={FINGER_W / 2}
        strokeWidth={1.5}
        className={cn(
          "stroke-foreground/35 transition-[fill,stroke,filter] duration-150 motion-reduce:transition-none",
          active
            ? "fill-emerald-400/40 stroke-emerald-400 filter-[drop-shadow(0_0_5px_rgb(52_211_153/0.65))]"
            : "fill-foreground/10"
        )}
      />
    </g>
  );
}

function ThumbGroup({
  side,
  active,
  delta,
}: {
  side: Side;
  active: boolean;
  delta: Delta | null;
}) {

  const transform =
    active && delta != null && (delta.dx !== 0 || delta.dy !== 0)
      ? `translate(${delta.dx} ${delta.dy})`
      : undefined;
  return (
    <g
      data-finger="thumb"
      data-side={side}
      transform={transform}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      className="transition-transform duration-150 ease-out motion-reduce:transition-none"
    >
      <rect
        x={THUMB.x}
        y={THUMB.y}
        width={THUMB.w}
        height={THUMB.h}
        rx={THUMB.rx}
        transform={`rotate(${THUMB.rotate.angle} ${THUMB.rotate.cx} ${THUMB.rotate.cy})`}
        strokeWidth={1.5}
        className={cn(
          "stroke-foreground/35 transition-[fill,stroke,filter] duration-150 motion-reduce:transition-none",
          active
            ? "fill-emerald-400/40 stroke-emerald-400 filter-[drop-shadow(0_0_5px_rgb(52_211_153/0.65))]"
            : "fill-foreground/10"
        )}
      />
    </g>
  );
}

function HandSvg({
  side,
  activeFinger,
  fingerDelta,
}: {
  side: Side;
  activeFinger: Finger | null;

  fingerDelta: Delta | null;
}) {

  const svgDelta: Delta | null =
    fingerDelta != null
      ? { dx: side === "right" ? -fingerDelta.dx : fingerDelta.dx, dy: fingerDelta.dy }
      : null;

  return (
    <svg
      viewBox={`0 0 ${HAND_W} ${HAND_H}`}
      width={HAND_W}
      height={HAND_H}
      aria-hidden="true"
      
      style={{ overflow: "visible" }}
      className={cn("pointer-events-none block", side === "right" && "transform-[scaleX(-1)]")}
    >
      <rect
        data-part="palm"
        x={PALM.x}
        y={PALM.y}
        width={PALM.w}
        height={PALM.h}
        rx={PALM.rx}
        strokeWidth={1.5}
        className="fill-foreground/10 stroke-foreground/35"
      />
      <ThumbGroup side={side} active={activeFinger === "thumb"} delta={svgDelta} />
      <FingerGroup
        finger="pinky"
        active={activeFinger === "pinky"}
        delta={svgDelta}
      />
      <FingerGroup
        finger="ring"
        active={activeFinger === "ring"}
        delta={svgDelta}
      />
      <FingerGroup
        finger="middle"
        active={activeFinger === "middle"}
        delta={svgDelta}
      />
      <FingerGroup
        finger="index"
        active={activeFinger === "index"}
        delta={svgDelta}
      />
    </svg>
  );
}

type Props = {
  activeChar: string | null | undefined;
  showNumberRow: boolean;
  className?: string;
};

function deltaForActiveFinger(
  side: Side,
  info: QwertyFingerInfo
): Delta {
  const home = HOME_POS[side][info.finger];
  return {
    dx: (info.x - home.x) * KEY_STEP_PX,
    dy: (info.y - home.y) * KEY_STEP_PX,
  };
}

export function TypingGameHandsOverlay({ activeChar, showNumberRow, className }: Props) {
  const info = lookupQwertyFinger(activeChar);

  const isThumbBoth = info?.finger === "thumb" && info.hand === "both";
  const leftActive: Finger | null = isThumbBoth
    ? "thumb"
    : info?.hand === "left"
    ? info.finger
    : null;
  const rightActive: Finger | null = isThumbBoth
    ? "thumb"
    : info?.hand === "right"
    ? info.finger
    : null;

  const leftDelta: Delta | null =
    info && leftActive != null ? deltaForActiveFinger("left", info) : null;
  const rightDelta: Delta | null =
    info && rightActive != null ? deltaForActiveFinger("right", info) : null;

  const homeRowTop = showNumberRow ? HOME_ROW_TOP_WITH_NUMBER : HOME_ROW_TOP_NO_NUMBER;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-30 overflow-visible",
        className
      )}
    >
      <div
        className="absolute"
        style={{ left: LEFT_HAND_LEFT, top: homeRowTop, width: HAND_W, height: HAND_H }}
      >
        <HandSvg side="left" activeFinger={leftActive} fingerDelta={leftDelta} />
      </div>
      <div
        className="absolute"
        style={{ left: RIGHT_HAND_LEFT, top: homeRowTop, width: HAND_W, height: HAND_H }}
      >
        <HandSvg side="right" activeFinger={rightActive} fingerDelta={rightDelta} />
      </div>
    </div>
  );
}
