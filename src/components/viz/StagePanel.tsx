"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { HighlightedStage } from "./PipelineDiagram";

/**
 * The stage detail panel. Split out so Radix Dialog and its icon load on the
 * first stage click rather than on every visit to the home page (§8).
 */
export default function StagePanel({
  stage,
  onClose,
}: {
  stage: HighlightedStage | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={stage !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-veil
          className="bg-void/80 fixed inset-0 z-50 backdrop-blur-[1px]"
        />
        <Dialog.Content
          data-panel
          className="border-hairline bg-void fixed inset-y-0 right-0 z-50 flex w-full max-w-[36rem] flex-col overflow-y-auto border-l p-6 outline-none sm:p-8"
        >
          {stage ? (
            <>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="label-mono">
                    <span className="text-signal">{stage.index}</span> /
                    pipeline stage
                  </p>
                  <Dialog.Title className="font-display text-title mt-2">
                    {stage.title}
                  </Dialog.Title>
                  <Dialog.Description className="label-mono mt-2">
                    {stage.kicker}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  aria-label="Close stage detail"
                  className="border-hairline text-steel ease-brief hover:border-signal hover:text-signal shrink-0 border p-2 transition-colors duration-[var(--dur-ui)]"
                >
                  <X size={16} aria-hidden />
                </Dialog.Close>
              </div>

              <div className="mt-6 flex flex-col gap-4">
                {stage.body.map((paragraph) => (
                  <p key={paragraph} className="measure text-body text-steel">
                    {paragraph}
                  </p>
                ))}
              </div>

              {stage.code && stage.codeHtml ? (
                <figure className="m-0 mt-8">
                  <figcaption className="label-mono mb-2">
                    {stage.code.filename}
                  </figcaption>
                  <div
                    className="border-hairline text-small overflow-x-auto border [&_code]:font-mono [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-4"
                    // Highlighted on the server by Shiki from local content.
                    dangerouslySetInnerHTML={{ __html: stage.codeHtml }}
                  />
                </figure>
              ) : null}
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
