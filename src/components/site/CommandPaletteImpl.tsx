"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Command } from "cmdk";
import Fuse from "fuse.js";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { profile, projects, skills } from "@/content";
import { sections } from "@/lib/site";
import { useUi } from "@/stores/ui";
import { playTick } from "./sound";

type Action = {
  id: string;
  label: string;
  group: string;
  keywords: string;
  run: (ctx: Ctx) => void;
};

type Ctx = {
  push: (href: string) => void;
  close: () => void;
  toggleSound: () => void;
  soundOn: boolean;
  setTheme: (theme: string) => void;
  theme: string | undefined;
};

/**
 * §6 — the command palette. Fuse.js fuzzy-matches project names and skills so a
 * half-remembered word still finds the right row.
 *
 * Loaded on demand by `CommandPalette`; cmdk and Fuse never reach first load.
 */
export default function CommandPaletteImpl() {
  const open = useUi((state) => state.paletteOpen);
  const setOpen = useUi((state) => state.setPaletteOpen);
  const soundOn = useUi((state) => state.soundOn);
  const toggleSound = useUi((state) => state.toggleSound);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const actions = useMemo<Action[]>(() => buildActions(), []);

  const fuse = useMemo(
    () =>
      new Fuse(actions, {
        keys: [
          { name: "label", weight: 0.7 },
          { name: "keywords", weight: 0.3 },
        ],
        threshold: 0.38,
        ignoreLocation: true,
      }),
    [actions],
  );

  const results = query.trim()
    ? fuse.search(query).map((hit) => hit.item)
    : actions;

  const grouped = results.reduce<Record<string, Action[]>>((acc, action) => {
    (acc[action.group] ??= []).push(action);
    return acc;
  }, {});

  const ctx: Ctx = {
    push: (href) => router.push(href),
    close: () => setOpen(false),
    toggleSound,
    soundOn,
    setTheme,
    theme,
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay data-veil className="bg-void/85 fixed inset-0 z-[60]" />
        <Dialog.Content className="border-hairline bg-void fixed top-[12vh] left-1/2 z-[60] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 border outline-none">
          <VisuallyHidden>
            <Dialog.Title>Command palette</Dialog.Title>
            <Dialog.Description>
              Search sections, projects, and actions. Press Escape to close.
            </Dialog.Description>
          </VisuallyHidden>

          <Command shouldFilter={false} loop label="Command palette">
            <div className="rule-bottom flex items-center gap-3 px-4 py-3">
              <span className="label-mono text-signal">/</span>
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a section, project, or action"
                className="text-small text-signal placeholder:text-steel w-full bg-transparent font-mono focus:outline-none"
              />
              <kbd className="label-mono border-hairline border px-2 py-1">
                esc
              </kbd>
            </div>

            <Command.List className="max-h-[52vh] overflow-y-auto p-2">
              <Command.Empty className="label-mono px-2 py-6">
                Nothing matches that. The three most-opened pages are the subway
                pipeline case study, selected work, and the résumé.
              </Command.Empty>

              {Object.entries(grouped).map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:label-mono [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2"
                >
                  {items.map((action) => (
                    <Command.Item
                      key={action.id}
                      value={action.id}
                      onSelect={() => {
                        void playTick("confirm");
                        action.run(ctx);
                      }}
                      className="text-small text-steel data-[selected=true]:bg-panel data-[selected=true]:text-signal flex cursor-pointer items-center justify-between gap-4 px-2 py-2.5"
                    >
                      <span>{action.label}</span>
                      <span className="label-mono">{action.group}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function buildActions(): Action[] {
  const jump: Action[] = sections.map((section) => ({
    id: `section-${section.id}`,
    label: `Go to ${section.label}`,
    group: "Sections",
    keywords: `${section.index} ${section.id} ${section.label}`,
    run: ({ push, close }) => {
      push(`/#${section.id}`);
      close();
    },
  }));

  const work: Action[] = projects.map((project) => ({
    id: `project-${project.slug}`,
    label: project.title,
    group: "Projects",
    keywords: `${project.stack.join(" ")} ${project.hook} ${project.period}`,
    run: ({ push, close }) => {
      push(`/#work`);
      close();
    },
  }));

  const capability: Action[] = skills.flatMap((group) =>
    group.items.map((item) => ({
      id: `skill-${group.label}-${item}`,
      label: item,
      group: "Capabilities",
      keywords: group.label,
      run: ({ push, close }) => {
        push("/#capabilities");
        close();
      },
    })),
  );

  const pages: Action[] = [
    {
      id: "page-about",
      label: "Open about",
      group: "Pages",
      keywords: "bio education certifications karate guitar",
      run: ({ push, close }) => {
        push("/about");
        close();
      },
    },
    {
      id: "page-resume",
      label: "Open résumé",
      group: "Pages",
      keywords: "cv print pdf",
      run: ({ push, close }) => {
        push("/resume");
        close();
      },
    },
  ];

  const commands: Action[] = [
    {
      id: "copy-email",
      label: "Copy email",
      group: "Actions",
      keywords: `${profile.email} contact mail`,
      run: ({ close }) => {
        navigator.clipboard
          .writeText(profile.email)
          .then(() => toast.success("Email copied"))
          .catch(() =>
            toast.error(
              `Copying was blocked. The address is ${profile.email}.`,
            ),
          );
        close();
      },
    },
    {
      id: "download-resume",
      label: "Download résumé",
      group: "Actions",
      keywords: "pdf cv download",
      run: ({ close }) => {
        window.location.href = "/aditya-aryan-resume.pdf";
        close();
      },
    },
    {
      id: "toggle-sound",
      label: "Toggle sound",
      group: "Actions",
      keywords: "audio mute ticks howler",
      run: ({ toggleSound, soundOn, close }) => {
        toggleSound();
        toast.success(soundOn ? "Sound off" : "Sound on");
        close();
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle print surface",
      group: "Actions",
      keywords: "theme light dark invert print",
      run: ({ setTheme, theme, close }) => {
        setTheme(theme === "print" ? "dark" : "print");
        close();
      },
    },
  ];

  return [...jump, ...work, ...pages, ...commands, ...capability];
}
