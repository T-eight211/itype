import KeyboardKey from "@/components/keyboard-keys";

export default function Logo() {
  return (
    // hide on mobile
    <div className="flex items-center gap-1 hidden sm:flex">
      <KeyboardKey>I</KeyboardKey>
      <KeyboardKey>t</KeyboardKey>
      <KeyboardKey>y</KeyboardKey>
      <KeyboardKey>p</KeyboardKey>
      <KeyboardKey>e</KeyboardKey>
    </div>
  );
}
