import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Global UI state only — sound, the command palette, and the cursor label.
 * Nothing here is server data; that belongs to TanStack Query (§3).
 */
type UiState = {
  soundOn: boolean;
  paletteOpen: boolean;
  /** Label the custom cursor shows while over an annotated element. */
  cursorLabel: string | null;
  toggleSound: () => void;
  setPaletteOpen: (open: boolean) => void;
  setCursorLabel: (label: string | null) => void;
};

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      soundOn: false,
      paletteOpen: false,
      cursorLabel: null,
      toggleSound: () => set((state) => ({ soundOn: !state.soundOn })),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setCursorLabel: (cursorLabel) => set({ cursorLabel }),
    }),
    {
      name: "portfolio-ui",
      // Sound is off by default and only the choice itself is remembered (§6).
      partialize: (state) => ({ soundOn: state.soundOn }),
    },
  ),
);
