import { CommandBlock, PageLinkRow, PageShell, Section, renderPage } from "../site";

const currentPath = window.location.pathname;

renderPage(
  "GGEZ",
  <PageShell
    currentPath={currentPath}
    intro="GGEZ is a Game Framework to vibe code games. It gives you a CLI starter, a browser world editor called Trident, and an animation pipeline called Animation Studio, then gets out of your way so you can keep writing game code."
    stats={[
      { label: "Starter", value: "CLI scaffold" },
      { label: "Worlds", value: "Trident" },
      { label: "Animation", value: "Animation Studio" }
    ]}
    title="Code a game. Author the world. Keep the runtime yours."
  >
    <Section
      intro="The shortest path from zero to a running game is the CLI starter. It generates a vanilla Vite + TypeScript game with the runtime packages, starter scenes, and animation bundle hooks already wired."
      title="Create a game in a few commands"
    >
      <CommandBlock title="CLI">
        {`bunx create-ggez my-game
cd my-game
bun install
bun run dev`}
      </CommandBlock>
      <p>
        The generated project is intentionally small. You own the render loop, scene transitions, gameplay systems, and how much of the stack you keep or replace.
      </p>
      <PageLinkRow
        links={[
          {
            href: "getting-started/",
            label: "Getting Started",
            body: "CLI usage, install flow, and how to run the dev server without guesswork."
          },
          {
            href: "project-layout/",
            label: "Project Layout",
            body: "What the scaffold creates, where your scenes live, and how game code should be organized."
          },
          {
            href: "tools/",
            label: "Tools",
            body: "Install and run Trident and Animation Studio from this monorepo."
          }
        ]}
      />
    </Section>

    <Section
      intro="GGEZ is not trying to be an everything-engine. The runtime boundary stays in your app, while the tools produce content and helper packages you can compose around it."
      title="What ships with the framework"
    >
      <ul>
        <li>The CLI starter gives you a real project structure, not a throwaway sample.</li>
        <li>Trident focuses on world authoring and runtime exports for your game.</li>
        <li>Animation Studio exports animation bundles and graphs that your gameplay code can load and drive.</li>
        <li>You still own the camera, controls, render loop, scene lifecycle, and gameplay systems.</li>
      </ul>
      <p>
        That division matters. It keeps the framework useful without turning your project into a hard-to-untangle editor runtime.
      </p>
    </Section>

    <Section
      intro="This needs to be said plainly because it changes how you should evaluate the framework today."
      title="Treat it as experimental software"
    >
      <p>
        GGEZ is in an extremely experimental public preview. Expect APIs, generated project structure, runtime contracts, and editor workflows to change. Expect rough edges. Expect breakage.
      </p>
      <p>
        If you adopt it now, do it because you want to move quickly and you are comfortable working with a changing toolchain. If you need long-term stability today, this is too early.
      </p>
    </Section>
  </PageShell>
);