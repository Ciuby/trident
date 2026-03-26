import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  FolderOpen,
  FolderClosed,
  File,
  FileJson,
  FileCode,
  FileImage,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────

interface DirTreeEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path: string;
  children?: DirTreeEntry[];
}

interface FileBrowserPanelProps {
  projectPath: string | null;
  onFileOpen: (filePath: string) => void;
  onFileDoubleClick?: (filePath: string) => void;
  onClose: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  targetPath: string;
  targetName: string;
  isDirectory: boolean;
}

// ── File Icon Resolver ──────────────────────────────────────────────

function getFileIcon(name: string): ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconClass = "size-3.5 shrink-0";

  if (["json", "whmap"].includes(ext))
    return <FileJson className={cn(iconClass, "text-amber-400/70")} />;
  if (["ts", "tsx", "js", "jsx"].includes(ext))
    return <FileCode className={cn(iconClass, "text-sky-400/70")} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "hdr", "exr"].includes(ext))
    return <FileImage className={cn(iconClass, "text-emerald-400/70")} />;
  if (["glb", "gltf", "fbx", "obj"].includes(ext))
    return <File className={cn(iconClass, "text-purple-400/70")} />;
  if (["css", "html", "md"].includes(ext))
    return <FileText className={cn(iconClass, "text-rose-400/70")} />;
  return <File className={cn(iconClass, "text-foreground/40")} />;
}

// ── Tree Node Component ─────────────────────────────────────────────

function TreeNode({
  entry,
  depth,
  expandedPaths,
  onToggle,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  entry: DirTreeEntry;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirTreeEntry) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}) {
  const isExpanded = expandedPaths.has(entry.path);
  const paddingLeft = 8 + depth * 14;
  const isRenaming = renamingPath === entry.path;

  if (entry.isDirectory) {
    return (
      <>
        <button
          className="group flex w-full items-center gap-1.5 py-[3px] text-[11px] text-foreground/60 hover:bg-white/6 hover:text-foreground/90 transition-colors"
          style={{ paddingLeft }}
          onClick={() => onToggle(entry.path)}
          onContextMenu={(e) => onContextMenu(e, entry)}
        >
          {isExpanded ? (
            <ChevronDown className="size-3 shrink-0 text-foreground/30" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-foreground/30" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-amber-500/60" />
          ) : (
            <FolderClosed className="size-3.5 shrink-0 text-amber-500/50" />
          )}
          {isRenaming ? (
            <input
              autoFocus
              className="flex-1 bg-black/40 border border-emerald-400/40 rounded px-1 py-0 text-[11px] text-foreground/90 outline-none"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              onBlur={onRenameCancel}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{entry.name}</span>
          )}
        </button>
        {isExpanded &&
          entry.children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onFileClick={onFileClick}
              onFileDoubleClick={onFileDoubleClick}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
            />
          ))}
      </>
    );
  }

  const isWhmap = entry.name.endsWith(".whmap");

  return (
    <button
      className="group flex w-full items-center gap-1.5 py-[3px] text-[11px] text-foreground/50 hover:bg-white/6 hover:text-foreground/80 transition-colors"
      style={{ paddingLeft: paddingLeft + 14 }}
      onClick={() => {
        if (isWhmap && onFileDoubleClick) {
          onFileDoubleClick(entry.path);
        } else {
          onFileClick(entry.path);
        }
      }}
      onDoubleClick={() => onFileDoubleClick?.(entry.path)}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      {getFileIcon(entry.name)}
      {isRenaming ? (
        <input
          autoFocus
          className="flex-1 bg-black/40 border border-emerald-400/40 rounded px-1 py-0 text-[11px] text-foreground/90 outline-none"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit();
            if (e.key === "Escape") onRenameCancel();
          }}
          onBlur={onRenameCancel}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate">{entry.name}</span>
      )}
    </button>
  );
}

// ── Context Menu Overlay ────────────────────────────────────────────

function ContextMenuOverlay({
  state,
  onNewFile,
  onNewFolder,
  onDelete,
  onRename,
  onClose,
}: {
  state: ContextMenuState;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const itemClass =
    "flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-foreground/70 hover:bg-white/10 hover:text-foreground rounded transition-colors text-left";

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-44 rounded-lg border border-white/10 bg-[#1a1a1a]/95 backdrop-blur-xl p-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
      style={{ left: state.x, top: state.y }}
    >
      <button className={itemClass} onClick={onNewFile}>
        <FilePlus className="size-3.5 text-emerald-400/60" />
        New File
      </button>
      <button className={itemClass} onClick={onNewFolder}>
        <FolderPlus className="size-3.5 text-amber-400/60" />
        New Folder
      </button>
      <div className="my-1 h-px bg-white/8" />
      <button className={itemClass} onClick={onRename}>
        <Pencil className="size-3.5 text-sky-400/60" />
        Rename
      </button>
      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-red-400/80 hover:bg-red-500/15 hover:text-red-300 rounded transition-colors text-left"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
        Delete
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function FileBrowserPanel({ projectPath, onFileOpen, onFileDoubleClick, onClose }: FileBrowserPanelProps) {
  const [tree, setTree] = useState<DirTreeEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingMode, setCreatingMode] = useState<"file" | "folder" | null>(null);
  const [creatingName, setCreatingName] = useState("");
  const [creatingDir, setCreatingDir] = useState<string | null>(null);

  // Keep ref in sync so callbacks always see latest value
  useEffect(() => {
    contextMenuRef.current = contextMenu;
  }, [contextMenu]);

  const api = (window as any).electronAPI;
  const isElectron = !!api?.isElectron;

  const loadTree = useCallback(async () => {
    if (!projectPath || !isElectron) return;

    setLoading(true);
    setError(null);

    try {
      const entries = await api.readDirTree(projectPath);
      setTree(entries);
    } catch (err: any) {
      setError(err.message ?? "Failed to read project");
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath, isElectron]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // ── Context Menu Handlers ───────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: DirTreeEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setCreatingMode(null); // dismiss any pending create input
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetPath: entry.path,
      targetName: entry.name,
      isDirectory: entry.isDirectory,
    });
  }, []);

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    if (!projectPath) return;
    e.preventDefault();
    setCreatingMode(null);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetPath: projectPath,
      targetName: projectPath.split(/[\\/]/).pop() ?? "",
      isDirectory: true,
    });
  }, [projectPath]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const getParentDir = (filePath: string) => {
    const sep = filePath.includes("\\") ? "\\" : "/";
    return filePath.substring(0, filePath.lastIndexOf(sep));
  };

  const startCreate = useCallback((mode: "file" | "folder") => {
    const cm = contextMenuRef.current;
    if (!cm) return;
    const targetDir = cm.isDirectory
      ? cm.targetPath
      : getParentDir(cm.targetPath);
    setCreatingDir(targetDir);
    setCreatingMode(mode);
    setCreatingName("");
    setContextMenu(null);
  }, []);

  const handleNewFile = useCallback(() => startCreate("file"), [startCreate]);
  const handleNewFolder = useCallback(() => startCreate("folder"), [startCreate]);

  const handleCreateSubmit = useCallback(async () => {
    if (!creatingDir || !creatingName.trim() || !api) {
      setCreatingMode(null);
      return;
    }
    const sep = creatingDir.includes("\\") ? "\\" : "/";
    const fullPath = `${creatingDir}${sep}${creatingName.trim()}`;
    try {
      if (creatingMode === "folder") {
        await api.mkdir(fullPath);
      } else {
        await api.writeFile(fullPath, "");
      }
      await loadTree();
    } catch (err) {
      console.error(`Failed to create ${creatingMode}:`, err);
    }
    setCreatingMode(null);
  }, [creatingDir, creatingName, creatingMode, api, loadTree]);

  const handleCreateCancel = useCallback(() => {
    setCreatingMode(null);
  }, []);

  // ── Delete with inline confirm ──────────────────────────────────
  const [deletingTarget, setDeletingTarget] = useState<{ path: string; name: string } | null>(null);

  const handleDelete = useCallback(() => {
    const cm = contextMenuRef.current;
    if (!cm) return;
    setDeletingTarget({ path: cm.targetPath, name: cm.targetName });
    setContextMenu(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingTarget || !api) return;
    try {
      await api.deleteFile(deletingTarget.path);
      await loadTree();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
    setDeletingTarget(null);
  }, [deletingTarget, api, loadTree]);

  const handleDeleteCancel = useCallback(() => {
    setDeletingTarget(null);
  }, []);

  const handleStartRename = useCallback(() => {
    if (!contextMenu) return;
    setRenamingPath(contextMenu.targetPath);
    setRenameValue(contextMenu.targetName);
    closeContextMenu();
  }, [contextMenu]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingPath || !renameValue.trim() || !api) return;

    const parentDir = getParentDir(renamingPath);
    const sep = parentDir.includes("\\") ? "\\" : "/";
    const newPath = `${parentDir}${sep}${renameValue.trim()}`;

    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }

    try {
      await api.rename(renamingPath, newPath);
      setRenamingPath(null);
      await loadTree();
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  }, [renamingPath, renameValue, api, loadTree]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  if (!isElectron) {
    return (
      <div className="flex h-full flex-col bg-black/30 backdrop-blur-xl border-r border-white/6">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/6">
          <span className="text-[11px] font-semibold tracking-wide text-foreground/50 uppercase">
            Project Files
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-[11px] text-foreground/30 text-center">
            File browser is only available in the Electron desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-black/30 backdrop-blur-xl border-r border-white/6">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/6">
        <span className="text-[11px] font-semibold tracking-wide text-foreground/50 uppercase">
          Project Files
        </span>
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 text-foreground/30 hover:bg-white/8 hover:text-foreground/70 transition-colors"
            onClick={loadTree}
            title="Refresh"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          </button>
          <button
            className="rounded p-1 text-foreground/30 hover:bg-white/8 hover:text-foreground/70 transition-colors"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Project name */}
      {projectPath && (
        <div className="px-3 py-1.5 border-b border-white/4">
          <p className="text-[10px] font-medium text-emerald-400/60 truncate">
            {projectPath.split(/[\\/]/).pop()}
          </p>
        </div>
      )}

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto min-h-0 py-1"
        onContextMenu={handleEmptyContextMenu}
      >
        {/* Inline create input */}
        {creatingMode && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/8 bg-white/3">
            {creatingMode === "folder" ? (
              <FolderPlus className="size-3.5 text-amber-400/70 shrink-0" />
            ) : (
              <FilePlus className="size-3.5 text-emerald-400/70 shrink-0" />
            )}
            <input
              autoFocus
              className="flex-1 bg-black/40 border border-emerald-400/40 rounded px-1.5 py-0.5 text-[11px] text-foreground/90 outline-none placeholder:text-foreground/25"
              placeholder={creatingMode === "folder" ? "Folder name..." : "File name..."}
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateSubmit();
                if (e.key === "Escape") handleCreateCancel();
              }}
            />
          </div>
        )}
        {/* Inline delete confirmation */}
        {deletingTarget && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-red-500/20 bg-red-500/8">
            <Trash2 className="size-3.5 text-red-400/70 shrink-0" />
            <span className="text-[11px] text-foreground/70 truncate flex-1">
              Delete <strong className="text-foreground/90">{deletingTarget.name}</strong>?
            </span>
            <button
              autoFocus
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors"
              onClick={handleDeleteConfirm}
            >
              Delete
            </button>
            <button
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/10 text-foreground/60 hover:bg-white/15 hover:text-foreground/90 transition-colors"
              onClick={handleDeleteCancel}
            >
              Cancel
            </button>
          </div>
        )}
        {!projectPath && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
            <FolderOpen className="size-8 text-foreground/15" />
            <p className="text-[11px] text-foreground/30 text-center">
              No project open.<br />
              Use <span className="text-foreground/50">File → Open Project</span> to get started.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3">
            <p className="text-[11px] text-red-400/70">{error}</p>
          </div>
        )}

        {!error && tree.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expandedPaths={expandedPaths}
            onToggle={toggleExpanded}
            onFileClick={onFileOpen}
            onFileDoubleClick={onFileDoubleClick}
            onContextMenu={handleContextMenu}
            renamingPath={renamingPath}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenuOverlay
          state={contextMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onDelete={handleDelete}
          onRename={handleStartRename}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
