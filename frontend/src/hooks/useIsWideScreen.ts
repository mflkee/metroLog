import { useEffect, useState } from "react";

/** The viewport where the dashboard shows its multi-column grid (Tailwind `xl`). */
const WIDE_SCREEN_QUERY = "(min-width: 1280px)";

function readIsWideScreen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(WIDE_SCREEN_QUERY).matches;
}

/** True on a wide viewport; used to offer dashboard dragging only where the grid exists. */
export function useIsWideScreen(): boolean {
  const [isWideScreen, setIsWideScreen] = useState(readIsWideScreen);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(WIDE_SCREEN_QUERY);
    const handleChange = () => setIsWideScreen(query.matches);
    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return isWideScreen;
}
