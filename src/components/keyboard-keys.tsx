interface KeyboardKeyProps {
  children: React.ReactNode;
  className?: string;
}

export default function KeyboardKey({
  children,
  className = "",
}: KeyboardKeyProps) {
  const text = typeof children === "string" ? children : "";

  return (
    <>
      <style>
        {`
          @keyframes rainbow {
            0% { background-position: 0%; }
            100% { background-position: 200%; }
          }
        `}
      </style>

      <button
        className={`
        group
        relative
        inline-flex

        h-[15px] sm:h-[30px] md:h-[60px] /* change this */
        w-[15px] sm:w-[30px] md:w-[60px] /* change this */

        items-center
        flex-col
        
        rounded-[2.5px] sm:rounded-[5px] md:rounded-[10px] // change this
        p-0.75 sm:p-1.5 md:p-3 /* change this */

        bg-gradient-to-t from-[#282828] to-[#202020]
        shadow-[inset_0_-8px_8px_rgba(0,0,0,0.15),inset_0_-8px_8px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.75),10px_20px_25px_rgba(0,0,0,0.4)]
        
        transition-transform
        active:translate-y-0.25 sm:active:translate-y-0.5 md:active:translate-y-1
        focus:outline-none
        
        /* THE KEY BEVEL (Top Surface) */
        before:absolute

        before:top-0.25 sm:before:top-0.5 md:before:top-1 /* change this */
        before:left-0.25 sm:before:left-0.5 md:before:left-1 /* change this */
        before:right-[0.1875rem] sm:before:right-[0.375rem] md:before:right-2.25
        before:bottom-0.75 sm:before:bottom-1.5 md:before:bottom-3

        before:z-10
        
        before:rounded-[2.5px] sm:before:rounded-[5px] md:before:rounded-[10px]

        before:bg-gradient-to-r before:from-[#232323] before:to-[#4a4a4a]
        before:content-['']
        before:border-t-[1px] before:border-t-[#0009] 
        before:border-l-[1px] before:border-l-[#0004]
        before:border-b-[1px] before:border-b-[#0004]
        before:shadow-[inset_-10px_-10px_10px_rgba(255,255,255,0.15),10px_5px_10px_rgba(0,0,0,0.15)]
        
        /* THE RAINBOW GLOW (Behind the key) */
        after:absolute

        after:-inset-[0.09375rem] sm:after:-inset-[0.1875rem] md:after:-inset-1.5 /* change this */

        after:-z-10

        after:rounded-[3.5px] sm:after:rounded-[7px] md:after:rounded-[14px] /* change this */
        after:blur-[2.25px] sm:after:blur-[4.5px] md:after:blur-[9px] /* change this */

        after:opacity-50
        after:content-['']
        after:bg-[length:200%]
        after:[animation:rainbow_2s_linear_infinite]
        after:bg-[linear-gradient(90deg,hsl(0,100%,63%),hsl(90,100%,63%),hsl(210,100%,63%),hsl(195,100%,63%),hsl(270,100%,63%))]
        
        ${className}
      `}
      >
        {/* TEXT: rainbow + glow */}
        <span
          data-text={text}
          className="
            relative
            z-20

            -left-0.25 sm:-left-0.5 md:-left-1 /* change this  */
            text-[0.28125rem] sm:text-[0.5625rem] md:text-lg /* change this  */
            font-normal
            
            /* rainbow text */
            bg-[linear-gradient(90deg,hsl(0,100%,63%),hsl(90,100%,63%),hsl(210,100%,63%),hsl(195,100%,63%),hsl(270,100%,63%))]
            bg-[length:200%]
            [animation:rainbow_2s_linear_infinite]
            bg-clip-text
            text-transparent

            /* glow layer */
            before:content-[attr(data-text)]
            before:absolute
            before:inset-0
            before:-z-10
            before:bg-[linear-gradient(90deg,hsl(0,100%,63%),hsl(90,100%,63%),hsl(210,100%,63%),hsl(195,100%,63%),hsl(270,100%,63%))]
            before:bg-[length:200%]
            before:[animation:rainbow_2s_linear_infinite]
            before:bg-clip-text
            before:text-transparent

            before:blur-[2px] sm:before:blur-[4px] md:before:blur-[8px] /* change this */
            before:opacity-90
          "
        >
          {children}
        </span>
      </button>
    </>
  );
}
