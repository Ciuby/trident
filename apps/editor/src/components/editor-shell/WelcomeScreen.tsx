import { FolderOpen, Plus, Sparkles, Clock, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

const RECENT_PROJECTS_KEY = "trident:recentProjects";
const MAX_RECENT = 5;

type RecentProject = {
  name: string;
  path: string;
  lastOpened: number;
};

type WelcomeScreenProps = {
  onCreateProject: () => Promise<void>;
  onOpenProject: () => Promise<void>;
  onOpenRecentProject?: (path: string) => Promise<void>;
};

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentProject(path: string) {
  const projects = getRecentProjects().filter((p) => p.path !== path);
  const name = path.split(/[\\/]/).pop() || path;
  projects.unshift({ name, path, lastOpened: Date.now() });
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects.slice(0, MAX_RECENT)));
}

export function WelcomeScreen({ onOpenProject, onCreateProject, onOpenRecentProject }: WelcomeScreenProps) {
  const [busy, setBusy] = useState<"open" | "create" | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  const handleOpen = useCallback(async () => {
    setBusy("open");
    try {
      await onOpenProject();
    } catch (err) {
      console.error("[WelcomeScreen] handleOpen error:", err);
    } finally {
      setBusy(null);
    }
  }, [onOpenProject]);

  const handleCreate = useCallback(async () => {
    setBusy("create");
    try {
      await onCreateProject();
    } catch (err) {
      console.error("[WelcomeScreen] handleCreate error:", err);
    } finally {
      setBusy(null);
    }
  }, [onCreateProject]);

  const handleOpenRecent = useCallback(async (path: string) => {
    if (!onOpenRecentProject) return;
    setBusy("open");
    try {
      await onOpenRecentProject(path);
    } catch (err) {
      console.error("[WelcomeScreen] handleOpenRecent error:", err);
    } finally {
      setBusy(null);
    }
  }, [onOpenRecentProject]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          void handleOpen();
        } else if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void handleCreate();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpen, handleCreate]);

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-black/60 backdrop-blur-md text-foreground">
      {/* Full-screen background with centered floating card */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="relative w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Glow behind card */}
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-emerald-500/8 to-transparent blur-2xl" />

          {/* Main Card */}
          <div className="relative rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden">
            {/* Header */}
            <div className="flex flex-col items-center gap-2 px-8 pt-10 pb-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 border border-emerald-400/20 shadow-[0_0_24px_rgba(16,185,129,0.12)]">
                  <Sparkles className="h-5 w-5 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white/90 to-white/60 bg-clip-text text-transparent">
                  Trident Editor
                </h1>
              </div>
              <p className="text-xs text-foreground/35 tracking-wide">
                Level editor for GGEZ game engine
              </p>
            </div>

            {/* Divider */}
            <div className="mx-6 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

            {/* Action Buttons */}
            <div className="flex gap-3 px-6 py-5">
              <button
                className="group relative flex flex-1 items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3.5 text-left transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.04] disabled:opacity-50 disabled:pointer-events-none"
                disabled={busy !== null}
                onClick={handleOpen}
                type="button"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 border border-emerald-400/10 transition-all group-hover:bg-emerald-400/15 group-hover:border-emerald-400/20">
                  <FolderOpen className="h-4 w-4 text-emerald-400/80 group-hover:text-emerald-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground/75 group-hover:text-foreground/90">
                    {busy === "open" ? "Opening…" : "Open Project"}
                  </div>
                  <div className="text-[10px] text-foreground/30">Ctrl+O</div>
                </div>
              </button>

              <button
                className="group relative flex flex-1 items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3.5 text-left transition-all duration-200 hover:border-cyan-400/20 hover:bg-white/[0.04] disabled:opacity-50 disabled:pointer-events-none"
                disabled={busy !== null}
                onClick={handleCreate}
                type="button"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 border border-cyan-400/10 transition-all group-hover:bg-cyan-400/15 group-hover:border-cyan-400/20">
                  <Plus className="h-4 w-4 text-cyan-400/80 group-hover:text-cyan-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground/75 group-hover:text-foreground/90">
                    {busy === "create" ? "Creating…" : "New Project"}
                  </div>
                  <div className="text-[10px] text-foreground/30">Ctrl+N</div>
                </div>
              </button>
            </div>

            {/* Recent Projects */}
            {recentProjects.length > 0 && (
              <>
                <div className="mx-6 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
                <div className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-3 w-3 text-foreground/30" />
                    <span className="text-[10px] font-medium tracking-[0.18em] text-foreground/30 uppercase">
                      Recent Projects
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {recentProjects.map((project) => (
                      <button
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-150 hover:bg-white/[0.04] disabled:opacity-50"
                        disabled={busy !== null || !onOpenRecentProject}
                        key={project.path}
                        onClick={() => handleOpenRecent(project.path)}
                        type="button"
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-foreground/25 group-hover:text-emerald-400/60" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 truncate">
                            {project.name}
                          </div>
                          <div className="text-[10px] text-foreground/20 truncate">
                            {project.path}
                          </div>
                        </div>
                        <span className="text-[10px] text-foreground/20 shrink-0">
                          {formatTimeAgo(project.lastOpened)}
                        </span>
                        <ChevronRight className="h-3 w-3 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex justify-center px-6 pb-6 pt-2">
              <span className="text-[10px] text-foreground/15 tracking-wider">
                v0.1 — GGEZ Engine
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
