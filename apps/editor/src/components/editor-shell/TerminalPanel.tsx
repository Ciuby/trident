import { useState, useRef, useCallback, useEffect } from "react";
import { SquareTerminal, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalPanelProps {
  projectPath: string | null;
}

import { uiStore } from "@/state/ui-store";
import { useSnapshot } from "valtio";

interface TerminalPanelProps {
  projectPath: string | null;
}

interface TerminalLine {
  type: "input" | "output" | "error";
  text: string;
}

interface TerminalTabState {
  id: string;
  name: string;
  initialCommand?: string;
}

let nextTerminalId = 1;

export function TerminalPanel({ projectPath }: TerminalPanelProps) {
  const ui = useSnapshot(uiStore);
  const [tabs, setTabs] = useState<TerminalTabState[]>([{ id: "term-1", name: "bash" }]);
  const [activeTabId, setActiveTabId] = useState<string>("term-1");

  // Consume pending commands from global store
  useEffect(() => {
    if (uiStore.pendingTerminalCommands.length > 0) {
      const cmds = [...uiStore.pendingTerminalCommands];
      uiStore.pendingTerminalCommands = [];
      
      const newTabs = [...tabs];
      let lastId = activeTabId;
      
      cmds.forEach(cmd => {
         nextTerminalId++;
         const tabId = `term-${nextTerminalId}`;
         newTabs.push({ id: tabId, name: cmd.name, initialCommand: cmd.command });
         lastId = tabId;
      });
      
      setTabs(newTabs);
      setActiveTabId(lastId);
    }
  }, [ui.pendingTerminalCommands.length, tabs, activeTabId]);

  const handleCreateTab = () => {
    nextTerminalId++;
    const newTab = { id: `term-${nextTerminalId}`, name: "bash" };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      nextTerminalId++;
      newTabs.push({ id: `term-${nextTerminalId}`, name: "bash" });
    }
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-t border-white/8 min-w-0">
      {/* Header with Tabs */}
      <div className="flex items-center bg-[#1a1a1a] border-b border-white/6 overflow-x-auto min-h-[30px] no-scrollbar">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 min-w-24 max-w-40 border-r border-white/5 cursor-pointer text-[10px] select-none",
              activeTabId === tab.id 
                ? "bg-[#0d0d0d] text-foreground border-t-2 border-t-emerald-400" 
                : "text-foreground/40 hover:bg-white/5 hover:text-foreground/70 border-t-2 border-t-transparent"
            )}
            title={tab.name}
          >
            <SquareTerminal className="size-3 shrink-0" />
            <span className="truncate flex-1">{tab.name}</span>
            <button
              onClick={(e) => handleCloseTab(tab.id, e)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded"
              title="Close Tab"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          onClick={handleCreateTab}
          className="ml-1 p-1 text-foreground/40 hover:bg-white/10 hover:text-foreground rounded transition-colors"
          title="New Terminal"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Terminal Instances */}
      <div className="flex-1 min-h-0 relative">
        {tabs.map(tab => (
          <TerminalInstance 
            key={tab.id} 
            projectPath={projectPath} 
            isActive={tab.id === activeTabId}
            initialCommand={tab.initialCommand}
          />
        ))}
      </div>
    </div>
  );
}

function TerminalInstance({ projectPath, isActive, initialCommand }: { projectPath: string | null; isActive: boolean; initialCommand?: string }) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", text: `Trident Terminal — ${projectPath ?? "No project open"}` },
    { type: "output", text: "Type a command and press Enter.\n" },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pidRef = useRef<string | null>(null);
  const hasInit = useRef(false);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Kill running process on unmount
  useEffect(() => {
    return () => {
      if (pidRef.current) {
        const api = (window as any).electronAPI;
        api?.killProcess?.(pidRef.current);
      }
    };
  }, []);

  const handleSpawn = useCallback(async (cmd: string) => {
    if (running) return;
    setLines((prev) => [...prev, { type: "input", text: `$ ${cmd}` }]);
    setRunning(true);
    
    const api = (window as any).electronAPI;
    if (api?.spawnProcess) {
      try {
        const pid = await api.spawnProcess(cmd, projectPath ?? undefined);
        pidRef.current = pid;
        
        const unsubData = api.onProcessData((payload: any) => {
          if (payload.pid === pid) {
            setLines((prev) => [...prev, { type: payload.type, text: payload.text }]);
          }
        });
        
        const unsubExit = api.onProcessExit((payload: any) => {
          if (payload.pid === pid) {
            setLines((prev) => [...prev, { type: "output", text: `\n[Process Exited with code ${payload.exitCode}]\n` }]);
            setRunning(false);
            pidRef.current = null;
            unsubData();
            unsubExit();
          }
        });
      } catch (err: any) {
        setLines((prev) => [...prev, { type: "error", text: err.message ?? "Failed to spawn" }]);
        setRunning(false);
      }
    } else {
      setLines((prev) => [...prev, { type: "error", text: "Streaming Terminal not available" }]);
      setRunning(false);
    }
    
    if (isActive) inputRef.current?.focus();
  }, [projectPath, running, isActive]);

  // Auto-run initial command once
  useEffect(() => {
    if (initialCommand && !hasInit.current) {
      hasInit.current = true;
      void handleSpawn(initialCommand);
    }
  }, [initialCommand, handleSpawn]);

  const handleRun = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setInput("");
    await handleSpawn(cmd);
  }, [input, running, handleSpawn]);

  const handleStop = useCallback(() => {
    if (pidRef.current) {
      const api = (window as any).electronAPI;
      api?.killProcess?.(pidRef.current);
    }
  }, []);

  const handleClear = useCallback(() => {
    setLines([{ type: "output", text: "Terminal cleared.\n" }]);
  }, []);

  return (
    <div className={cn("absolute inset-0 flex-col bg-[#0d0d0d]", isActive ? "flex" : "hidden")}>
      {/* Output area */}
      <div className="absolute right-3 top-2 z-10">
        <button
          className="rounded p-1 text-foreground/30 hover:bg-white/8 hover:text-foreground/60 transition-colors"
          onClick={handleClear}
          title="Clear terminal"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      
      <div
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed relative"
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === "input"
                ? "text-emerald-400/80"
                : line.type === "error"
                ? "text-red-400/80"
                : "text-foreground/60 whitespace-pre-wrap"
            }
          >
            {line.text}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 mt-2">
            <div className="text-foreground/30 animate-pulse">Running…</div>
            <button onClick={handleStop} className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-[10px]">
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/6 bg-[#111]">
        <span className="text-emerald-400/50 text-[11px] font-mono shrink-0">$</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-[11px] font-mono text-foreground/80 outline-none placeholder:text-foreground/20"
          disabled={running}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleRun();
            }
          }}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command..."
          value={input}
        />
      </div>
    </div>
  );
}
