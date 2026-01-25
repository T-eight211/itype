"use client"
import Image from "next/image";
import Wordmark from "@/components/wordmark";
import { BorderBeam } from "@/components/ui/border-beam";

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"  

export default function Logo() {
  const { theme } = useTheme()
  const [lightColor, setLightColor] = useState("#FAFAFA")
  useEffect(() => {
    setLightColor(theme === "dark" ? "#FAFAFA" : "#FF2056")
  }, [theme])
  return (
    <div className="flex items-center gap-1 md:gap-2">
      <div className="relative overflow-hidden md:rounded-xl sm:rounded-sm rounded-sm shadow-sm ">
        <BorderBeam 
          lightColor={lightColor} 
          lightWidth={100} 
          duration={8} 
          
        />
        <Image
          src="/logo-svg-transparent-full-width.svg"
          alt="IType Logo"
          width={40}
          height={40}
          className="w-8 h-8 sm:w-8 sm:h-8 md:w-16 md:h-16 relative"
        />
      </div>
      <Wordmark />
    </div>
  );
}
