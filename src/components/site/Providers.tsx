"use client";

import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";

/** Toasts only ever appear after an interaction, so Sonner loads after paint. */
const Toaster = dynamic(() => import("sonner").then((mod) => mod.Toaster), {
  ssr: false,
});

/**
 * §4.1 — the only theme switch is `dark` (default) and `print`, the inverted
 * light surface meant to be printed. There is no system-preference branch,
 * because the site has one intended appearance.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      themes={["dark", "print"]}
      defaultTheme="dark"
      enableSystem={false}
      enableColorScheme={false}
      disableTransitionOnChange
    >
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "label-mono flex w-full items-center gap-3 border border-hairline bg-panel px-4 py-3 text-signal",
            description: "text-steel",
          },
        }}
      />
    </ThemeProvider>
  );
}
