"use client"

import { TypingGame } from "@/features/typing-game/components/typing-game"
export default function GamePage() {


  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <TypingGame />
    </div>
  )
}
