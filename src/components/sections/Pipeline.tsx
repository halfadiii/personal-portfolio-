import { feeds, stages } from "@/content/pipeline";
import { SectionHeading } from "@/components/site/SectionHeading";
import {
  PipelineDiagram,
  type HighlightedStage,
} from "@/components/viz/PipelineDiagram";
import { highlight } from "@/lib/highlight";

/**
 * §6.5 — the proof-of-work section. Code is highlighted here, on the server, so
 * the client receives HTML and no highlighter.
 */
export async function Pipeline() {
  const highlighted: HighlightedStage[] = await Promise.all(
    stages.map(async (stage) => ({
      ...stage,
      codeHtml: stage.code
        ? await highlight(stage.code.source, stage.code.lang)
        : undefined,
    })),
  );

  return (
    <section
      id="pipeline"
      aria-labelledby="pipeline-title"
      className="section-gap-loose"
    >
      <div className="shell">
        <SectionHeading
          id="pipeline"
          index="01"
          label="subway pipeline"
          meta="8 feeds / 30s / bigquery / dbt"
          title="The MTA never records when a train actually arrives."
        >
          <p className="measure text-lead text-steel">
            It publishes what it expects to happen. An arrival is the moment a
            prediction stops being published — so the arrival has to be
            inferred, and every number downstream depends on inferring it
            correctly. Open a stage to see what it does and the code that runs
            it.
          </p>
        </SectionHeading>

        <div className="mt-12">
          <PipelineDiagram feeds={feeds} stages={highlighted} />
        </div>

        {/* Same content, no diagram required — §8. */}
        <details className="border-hairline mt-8 border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            Read the pipeline as a table
          </summary>
          <div className="overflow-x-auto">
            <table className="text-small w-full border-collapse text-left">
              <caption className="sr-only">
                Stages of the NYC subway reliability pipeline, in order.
              </caption>
              <thead>
                <tr className="rule-top rule-bottom">
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Stage
                  </th>
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Does
                  </th>
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Source file
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="rule-bottom">
                  <th
                    scope="row"
                    className="label-mono text-signal px-4 py-3 align-top"
                  >
                    00 / feeds
                  </th>
                  <td className="text-steel px-4 py-3 align-top">
                    Eight MTA GTFS-realtime endpoints:{" "}
                    {feeds.map((feed) => feed.label).join(", ")}.
                  </td>
                  <td className="label-mono px-4 py-3 align-top">—</td>
                </tr>
                {stages.map((stage) => (
                  <tr key={stage.id} className="rule-bottom last:border-b-0">
                    <th
                      scope="row"
                      className="label-mono text-signal px-4 py-3 align-top whitespace-nowrap"
                    >
                      {stage.index} / {stage.title.toLowerCase()}
                    </th>
                    <td className="text-steel px-4 py-3 align-top">
                      {stage.body[0]}
                    </td>
                    <td className="label-mono px-4 py-3 align-top">
                      {stage.code?.filename ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
