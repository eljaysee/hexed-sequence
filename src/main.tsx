import { Toaster } from "@/components/ui/sonner";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting.
const Landing = lazy(() => import("./pages/Landing.tsx"));
const Generator = lazy(() => import("./pages/Generator.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/studio" element={<Generator />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </HashRouter>
  </StrictMode>,
);
