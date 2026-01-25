"use client";

import { SignedIn, SignedOut, SignOutButton, useUser, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Logo from "@/components/wordmark";

export default function Header() {
  const { isLoaded } = useUser();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 py-4">
      <div className="mx-auto max-w-screen-2xl bg-background/80 backdrop-blur-sm border border-border shadow-lg rounded-2xl">
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center">
            <Logo />
          </div>
          {isLoaded && (
            <div className="flex items-center gap-4">
              <SignedOut>
                <Button asChild>
                  <Link href="/sign-up">Get Started</Link>
                </Button>
              </SignedOut>
              <SignedIn>
                <SignOutButton redirectUrl="/">
                  <UserButton />
                </SignOutButton>
              </SignedIn>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
