import "@fontsource-variable/space-grotesk";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";

type NavItem = {
  href: string;
  label: string;
};

type Stat = {
  label: string;
  value: string;
};

type PageShellProps = {
  eyebrow?: string;
  title: string;
  intro: string;
  currentPath: string;
  stats?: Stat[];
  children: ReactNode;
};

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
};

const navigation: NavItem[] = [
  { href: "", label: "Overview" },
  { href: "getting-started/", label: "Getting Started" },
  { href: "project-layout/", label: "Project Layout" },
  { href: "tools/", label: "Tools" }
];

export function renderPage(title: string, page: ReactNode) {
  document.title = title;

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("Missing #root element.");
  }

  createRoot(rootElement).render(<StrictMode>{page}</StrictMode>);
}

export function siteHref(path: string) {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const normalizedPath = path.replace(/^\/+/, "");

  return `${base}${normalizedPath}`;
}

function normalizePathname(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

function isActiveLink(path: string, currentPath: string) {
  const target = new URL(siteHref(path), window.location.origin).pathname;
  return normalizePathname(target) === normalizePathname(currentPath);
}

function NavLink({ href, label, currentPath }: NavItem & { currentPath: string }) {
  const active = isActiveLink(href, currentPath);

  return (
    <a
      className={[
        "page-link rounded-full px-4 py-2 text-sm font-medium",
        active ? "bg-emerald-400 text-slate-950 shadow-[0_10px_30px_rgba(16,185,129,0.35)]" : "bg-white/6 text-white/78 hover:bg-white/10"
      ].join(" ")}
      href={siteHref(href)}
    >
      {label}
    </a>
  );
}

export function PageShell({ eyebrow, title, intro, currentPath, stats, children }: PageShellProps) {
  return (
    <div className="site-shell">
      <div className="site-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -left-48 top-16 h-80 w-80 rounded-full bg-emerald-400/18 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-64 h-72 w-72 rounded-full bg-teal-300/14 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="surface fade-up rounded-4xl px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <a className="inline-flex items-center gap-3 rounded-full bg-black/20 px-3 py-2" href={siteHref("")}> 
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400 text-lg font-semibold text-slate-950">
                  G
                </span>
                <div>
                  <div className="text-sm font-semibold tracking-[0.24em] text-emerald-100/90">GGEZ</div>
                  <div className="text-xs text-white/55">Game Framework to vibe code games</div>
                </div>
              </a>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navigation.map((item) => (
                <NavLink key={item.href || "home"} currentPath={currentPath} {...item} />
              ))}
            </nav>
          </div>
        </header>

        <main className="mt-8 flex-1">
          <section className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_24rem] lg:items-end">
            <div className="fade-up">
              {eyebrow ? (
                <span className="eyebrow inline-flex rounded-full px-4 py-2 text-xs font-semibold tracking-[0.18em]">
                  {eyebrow}
                </span>
              ) : null}
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
                {title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/72 sm:text-xl">{intro}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  className="page-link rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_48px_rgba(16,185,129,0.25)]"
                  href={siteHref("getting-started/")}
                >
                  Start a game
                </a>
                <a className="page-link rounded-full bg-white/7 px-5 py-3 text-sm font-semibold text-white/88" href={siteHref("tools/")}> 
                  Open the editors
                </a>
              </div>
            </div>

            <aside className="surface spotlight fade-up-delay rounded-4xl p-6 sm:p-7">
              <div className="rounded-3xl bg-black/22 px-4 py-3 text-sm leading-6 text-emerald-100/90">
                Public preview. Extremely experimental. Expect it to break at any time.
              </div>
              <div className="mt-6 space-y-3 text-sm text-white/68">
                <div className="rounded-[1.35rem] bg-white/6 px-4 py-4">
                  GGEZ is for developers who want a lightweight runtime shell, a world editor, and an animation pipeline without committing to a giant engine.
                </div>
                <div className="rounded-[1.35rem] bg-white/6 px-4 py-4">
                  The CLI scaffolds a real game project. Trident authors worlds. Animation Studio authors graphs and bundles.
                </div>
              </div>
              {stats ? (
                <dl className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  {stats.map((stat) => (
                    <div key={stat.label} className="rounded-[1.35rem] bg-white/7 px-4 py-4">
                      <dt className="text-xs uppercase tracking-[0.24em] text-white/44">{stat.label}</dt>
                      <dd className="mt-2 text-xl font-semibold text-white">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </aside>
          </section>

          <div className="mt-12 space-y-8">{children}</div>
        </main>

        <footer className="surface-quiet mt-12 rounded-4xl px-6 py-6 text-sm text-white/60">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p>GGEZ ships fast, changes fast, and is not stable yet. Treat every release as a moving target.</p>
            <div className="flex flex-wrap gap-3 text-white/72">
              <a className="page-link rounded-full bg-white/6 px-4 py-2" href={siteHref("")}>Overview</a>
              <a className="page-link rounded-full bg-white/6 px-4 py-2" href={siteHref("getting-started/")}>CLI</a>
              <a className="page-link rounded-full bg-white/6 px-4 py-2" href={siteHref("tools/")}>Editors</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function Section({ id, eyebrow, title, intro, children }: SectionProps) {
  return (
    <section className="surface rounded-4xl px-6 py-8 sm:px-8 sm:py-10" id={id}>
      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div>
          {eyebrow ? (
            <span className="eyebrow inline-flex rounded-full px-4 py-2 text-xs font-semibold tracking-[0.18em]">
              {eyebrow}
            </span>
          ) : null}
          <h2 className={eyebrow ? "mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl" : "text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl"}>{title}</h2>
          {intro ? <p className="mt-4 max-w-sm text-base leading-7 text-white/64">{intro}</p> : null}
        </div>
        <div className="section-copy text-base leading-7">{children}</div>
      </div>
    </section>
  );
}

export function CommandBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="code-block rounded-3xl px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/78">{title}</div>
      <pre className="mt-3 overflow-x-auto text-sm leading-7 text-emerald-50">{children}</pre>
    </div>
  );
}

export function FileTree({ title, children }: { title: string; children: string }) {
  return (
    <div className="tree-block rounded-3xl bg-black/24 px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/48">{title}</div>
      <pre className="mt-3 overflow-x-auto text-sm leading-7 text-white/82">{children}</pre>
    </div>
  );
}

export function PageLinkRow({ links }: { links: Array<{ href: string; label: string; body: string }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {links.map((link) => (
        <a key={link.href} className="page-link rounded-[1.6rem] bg-white/6 px-5 py-5" href={siteHref(link.href)}>
          <div className="text-lg font-semibold text-white">{link.label}</div>
          <p className="mt-2 text-sm leading-6 text-white/62">{link.body}</p>
        </a>
      ))}
    </div>
  );
}