"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackgroundLines } from "@/components/ui/background-lines";
import { KeyboardRGBDemo } from "@/components/animated-keyboard";
import type { LeaderboardRow } from "@/features/leaderboard/server/get-leaderboards";

type LandingPageProps = {
  leaderboardRows: LeaderboardRow[];
};

function rankColor(rank: number): string {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-orange-300";
  return "text-muted-foreground";
}

function avatarFallback(username: string): string {
  return username.trim().charAt(0).toUpperCase() || "?";
}

function formatLeaderboardWpm(value: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function LandingPage({ leaderboardRows }: LandingPageProps) {
  const [text, setText] = useState("");
  const fullText = "Type Faster Than Ever";
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (isTyping) {
      if (text.length < fullText.length) {
        const timeout = setTimeout(() => {
          setText(fullText.slice(0, text.length + 1));
        }, 100);
        return () => clearTimeout(timeout);
      } else {
        setIsTyping(false);
      }
    }
  }, [text, isTyping]);

  return (
    <BackgroundLines className="absolute top-0 left-0 flex min-h-screen w-full flex-col px-4 pt-28 pb-15 sm:pt-24">
      <div className="relative z-20 mx-auto flex w-full max-w-7xl flex-1 flex-col">
        <div className="flex min-h-[min(82svh,860px)] flex-col items-center justify-center space-y-8 text-center">
          <div className="mx-auto w-full max-w-7xl">
            <h1 className="bg-clip-text text-transparent text-center bg-linear-to-b from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-400 text-4xl md:text-6xl lg:text-8xl font-sans font-bold tracking-tight">
              {text}
              <span className="animate-pulse">|</span>
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-center text-base text-neutral-700 md:text-xl dark:text-neutral-300">
              Master your typing skills with AI-powered practice and real-time feedback
            </p>

            <SignedOut>
              <div className="mt-8 flex justify-center gap-4">
                <Button variant="outline" asChild size="lg">
                  <Link href="/game">Play as guest</Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/sign-up">Get Started</Link>
                </Button>
              </div>
            </SignedOut>
          </div>

          <div className="mt-8 flex w-full justify-center overflow-hidden">
            <KeyboardRGBDemo />
          </div>
        </div>

        <section className="mx-auto mt-6 w-full max-w-3xl pb-20 pt-4">
          <p className="mb-4 text-center text-sm text-neutral-600 md:text-base dark:text-neutral-400">
            <Link href="/leaderboard" className="font-semibold text-primary underline-offset-4 hover:underline">
              Join the leaderboard
            </Link>
            <span className="text-neutral-700 dark:text-neutral-300">
              {" "}
              and compete for the best 15 second run.
            </span>
          </p>

          <div className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-sm">
            <h2 className="mb-3 text-center text-lg font-semibold text-foreground">
              All-Time 15 Seconds - top 20
            </h2>
            <div className="max-h-[min(70vh,32rem)] overflow-y-auto pr-1">
              {leaderboardRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No entries yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-12 gap-3 px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:gap-4 sm:px-4">
                    <div className="col-span-2 sm:col-span-1">Rank</div>
                    <div className="col-span-6 sm:col-span-8">Name</div>
                    <div className="col-span-4 text-right sm:col-span-3 sm:text-left">WPM</div>
                  </div>
                  <div className="space-y-2">
                    {leaderboardRows.map((row) => (
                      <div
                        key={`${row.rank}-${row.userId}`}
                        className="relative rounded-xl border border-border/50 bg-muted/50 p-3 sm:p-4"
                      >
                        <div className="relative grid grid-cols-12 gap-3 items-center sm:gap-4">
                          <div className="col-span-2 flex justify-start sm:col-span-1">
                            <span className={`text-xl font-bold tabular-nums sm:text-2xl ${rankColor(row.rank)}`}>
                              {row.rank}
                            </span>
                          </div>
                          <div className="col-span-6 flex min-w-0 items-center gap-2 sm:col-span-8 sm:gap-3">
                            {row.profileImageUrl ? (
                              <img
                                src={row.profileImageUrl}
                                alt=""
                                className="size-8 shrink-0 rounded-full border border-border/40 object-cover sm:size-9"
                              />
                            ) : (
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted text-xs font-semibold sm:size-9 sm:text-sm">
                                {avatarFallback(row.username)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground sm:text-base">
                                {row.username}
                              </p>
                              {row.topBadges.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {row.topBadges.slice(0, 3).map((badge) => (
                                    <Badge key={`${row.userId}-${badge.key}`} variant="secondary" className="text-[10px]">
                                      {badge.name}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="col-span-4 text-right font-mono text-sm font-medium text-foreground tabular-nums sm:col-span-3 sm:text-left sm:text-base">
                            {formatLeaderboardWpm(row.wpm)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </BackgroundLines>
  );
}
