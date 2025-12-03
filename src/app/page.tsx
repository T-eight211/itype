"use client"

import Image from "next/image";
import { SignedIn, SignedOut, SignOutButton, useUser, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";


export default function Home() {
  const { isLoaded } = useUser()

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
            
            </div>
            {isLoaded && (
              <>
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
              </>
            )}
          </div>
        </div>
      </header>
      <div className="pt-16">
        <div>hello world</div>
      </div>
    </>
  );
}
