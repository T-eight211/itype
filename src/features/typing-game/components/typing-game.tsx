"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Clock, Type, Quote, Hash, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import englishWords from "@/data/languages/english.json";

export function TypingGame() {
  const [mode, setMode] = useState<"time" | "words" | "quote">("time");
  const [wordCount, setWordCount] = useState("25");
  const [timerDuration, setTimerDuration] = useState("30");
  const [quoteLength, setQuoteLength] = useState<"all" | "short" | "medium" | "long" | "thicc">("all");
  const [punctuation, setPunctuation] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [displayText, setDisplayText] = useState("");

  const generateWords = (count: number) => {
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      const randomIndex = Math.floor(Math.random() * englishWords.words.length);
      words.push(englishWords.words[randomIndex]);
    }
    return words.join(" ");
  };

  const addPunctuation = (text: string) => {
    const sentences = text.split(" ");
    let result = "";
    for (let i = 0; i < sentences.length; i++) {
      result += sentences[i];
      if (i < sentences.length - 1) {
        const random = Math.random();
        if (random < 0.1) result += ",";
        else if (random < 0.15) result += ".";
        result += " ";
      }
    }
    return result + ".";
  };

  const addNumbers = (text: string) => {
    const words = text.split(" ");
    const numWords = Math.floor(words.length * 0.1);
    for (let i = 0; i < numWords; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      words[randomIndex] = Math.floor(Math.random() * 1000).toString();
    }
    return words.join(" ");
  };

  useEffect(() => {
    if (mode === "time" || mode === "words") {
      const count = mode === "words" ? parseInt(wordCount) : 50;
      let text = generateWords(count);
      
      if (numbers) {
        text = addNumbers(text);
      }
      
      if (punctuation) {
        text = addPunctuation(text);
      }
      
      setDisplayText(text);
    } else if (mode === "quote") {
      setDisplayText("Quote mode coming soon...");
    }
  }, [mode, wordCount, punctuation, numbers]);

  return (
    <div className="container grid grid-rows-[auto_1fr_auto] gap-6 min-h-[calc(100vh-8rem)] justify-center">
      <div className="flex items-center justify-center gap-3">
        <ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as typeof mode)}>
          <ToggleGroupItem value="time" aria-label="Time mode">
            <Clock className="w-4 h-4 mr-2" />
            time
          </ToggleGroupItem>
          <ToggleGroupItem value="words" aria-label="Words mode">
            <Type className="w-4 h-4 mr-2" />
            words
          </ToggleGroupItem>
          <ToggleGroupItem value="quote" aria-label="Quote mode">
            <Quote className="w-4 h-4 mr-2" />
            quote
          </ToggleGroupItem>
        </ToggleGroup>
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Dynamic Options based on mode */}
        {mode === "words" && (
          <ToggleGroup type="single" value={wordCount} onValueChange={(value) => value && setWordCount(value)}>
            <ToggleGroupItem value="10">10</ToggleGroupItem>
            <ToggleGroupItem value="25">25</ToggleGroupItem>
            <ToggleGroupItem value="50">50</ToggleGroupItem>
            <ToggleGroupItem value="100">100</ToggleGroupItem>
          </ToggleGroup>
        )}
        
        {mode === "time" && (
          <ToggleGroup type="single" value={timerDuration} onValueChange={(value) => value && setTimerDuration(value)}>
            <ToggleGroupItem value="15">15</ToggleGroupItem>
            <ToggleGroupItem value="30">30</ToggleGroupItem>
            <ToggleGroupItem value="60">60</ToggleGroupItem>
            <ToggleGroupItem value="120">120</ToggleGroupItem>
          </ToggleGroup>
        )}
        
        {mode === "quote" && (
          <ToggleGroup type="single" value={quoteLength} onValueChange={(value) => value && setQuoteLength(value as typeof quoteLength)}>
            <ToggleGroupItem value="all">all</ToggleGroupItem>
            <ToggleGroupItem value="short">short</ToggleGroupItem>
            <ToggleGroupItem value="medium">medium</ToggleGroupItem>
            <ToggleGroupItem value="long">long</ToggleGroupItem>
            <ToggleGroupItem value="thicc">thicc</ToggleGroupItem>
          </ToggleGroup>
        )}
        
        {(mode === "words" || mode === "time") && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <ToggleGroup type="multiple" value={[punctuation ? "punctuation" : "", numbers ? "numbers" : ""].filter(Boolean)}>
              <ToggleGroupItem 
                value="punctuation" 
                aria-label="Toggle punctuation"
                onClick={() => setPunctuation(!punctuation)}
              >
                <AtSign className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="numbers" 
                aria-label="Toggle numbers"
                onClick={() => setNumbers(!numbers)}
              >
                <Hash className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        )}
      </div>

      <div className="flex items-center justify-center">
        <div className="text-2xl md:text-3xl leading-relaxed font-mono text-left max-w-4xl w-full">
          <span className="text-muted-foreground">
            {displayText}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">WPM</span>
          <span className="text-3xl font-bold text-foreground">0</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Accuracy</span>
          <span className="text-3xl font-bold text-foreground">100%</span>
        </div>
        {mode === "time" && (
          <div className="flex flex-col items-center">
            <span className="text-xs uppercase tracking-wider">Time</span>
            <span className="text-3xl font-bold text-foreground">{timerDuration}s</span>
          </div>
        )}
        {mode === "words" && (
          <div className="flex flex-col items-center">
            <span className="text-xs uppercase tracking-wider">Progress</span>
            <span className="text-3xl font-bold text-foreground">0/{wordCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
