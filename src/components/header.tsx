"use client";

import { SignedIn, SignedOut, useUser, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Logo from "@/components/logo";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BarChart3, Settings, User } from "lucide-react";

const gameModes = [
  { title: "Time", href: "/game?mode=time", description: "Type for a set duration." },
  { title: "Words", href: "/game?mode=words", description: "Type a set number of words." },
  { title: "Quote", href: "/game?mode=quote", description: "Type a random quote." },
];

export default function Header() {
  const { isLoaded } = useUser();

  return (
    <header className="sticky top-0 z-50 px-4 sm:px-6 lg:px-8 py-4 bg-transparent">
      <div className="mx-auto max-w-screen-2xl bg-background/30 backdrop-blur-sm border border-border shadow-lg rounded-2xl">
        <div className="flex items-center justify-between gap-4 px-6 py-2 md:grid md:grid-cols-[1fr_auto_1fr] md:justify-normal">
          <Link href="/" className="flex items-center justify-start">
            <Logo />
          </Link>
          <NavigationMenu className="hidden md:flex justify-center">
            <NavigationMenuList className="gap-1">
              <NavigationMenuItem>
                <NavigationMenuTrigger>Game</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="w-64 gap-1 p-2">
                    {gameModes.map((mode) => (
                      <li key={mode.title}>
                        <NavigationMenuLink asChild>
                          <Link
                            href={mode.href}
                            className="flex flex-col gap-1 rounded-sm p-3 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <span className="font-medium">{mode.title}</span>
                            <span className="text-xs text-muted-foreground">{mode.description}</span>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link href="/pricing">Pricing</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link href="/about">About</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link href="/leaderboard">Leaderboard</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          {isLoaded && (
            <div className="flex items-center justify-end">
              <SignedOut>
                <div className="flex items-center gap-1">
                  <Link
                    href="/settings"
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Settings"
                  >
                    <Settings className="size-5" />
                  </Link>
                  <Link href="/log-in" className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar>
                      <AvatarFallback className="bg-muted"><User className="size-4" /></AvatarFallback>
                    </Avatar>
                  </Link>
                </div>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/">
                  <UserButton.MenuItems>
                    <UserButton.Link
                      href="/stats"
                      label="Stats"
                      labelIcon={<BarChart3 className="size-4" />}
                    />
                    <UserButton.Link
                      href="/settings"
                      label="Settings"
                      labelIcon={<Settings className="size-4" />}
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </SignedIn>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
