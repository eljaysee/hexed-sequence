import { motion } from "framer-motion";
import { Ghost, Home, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { HexLogo } from "@/components/HexLogo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 font-mono text-foreground">
      <div className="hexed-scanlines" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex w-full max-w-lg flex-col items-center text-center"
      >
        <HexLogo />
        <div className="mt-12 flex size-16 items-center justify-center rounded-md border border-red-500/40 bg-black/40 text-red-500">
          <Ghost className="size-8" />
        </div>
        <h1 className="hexed-glow mt-6 text-7xl font-black tracking-tight text-red-500">
          404
        </h1>
        <p className="mt-3 text-lg font-bold tracking-wide">
          THIS PAGE IS NOT IN THE SCALE.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The sequence you sought has been lost to the void. Return to the
          studio and summon something new.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            className="bg-red-600 font-bold tracking-widest text-white hover:bg-red-500"
          >
            <Link to="/studio">
              <Sparkles className="size-4" />
              STUDIO
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="font-bold tracking-widest"
          >
            <Link to="/">
              <Home className="size-4" />
              HOME
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
