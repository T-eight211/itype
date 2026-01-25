"use client";

import React, { useEffect, useState } from "react";
import { BackgroundLines } from "@/components/ui/background-lines";
import { KeyboardRGBDemo } from "@/components/animated-keyboard";

export function LandingPage() {
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
    <BackgroundLines className="flex items-center justify-center w-full flex-col px-4 py-20 min-h-screen">
      <div className="w-full text-center space-y-8 relative z-20">
        <div className="max-w-7xl mx-auto">
          <h1 className="bg-clip-text text-transparent text-center bg-gradient-to-b from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-400 text-4xl md:text-6xl lg:text-8xl font-sans font-bold tracking-tight">
            {text}
            <span className="animate-pulse">|</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-base md:text-xl text-neutral-700 dark:text-neutral-300 text-center mt-4">
            Master your typing skills with AI-powered practice and real-time feedback
          </p>
        </div>

        <div className="mt-12 w-full flex justify-center overflow-hidden">
          <KeyboardRGBDemo />
        </div>
      </div>
    </BackgroundLines>
  );
}
