import { useEffect } from "react";
import { connectShellStore, useShellStore } from "./store";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { ContentArea } from "./components/ContentArea";
import { AIPanel } from "./components/AIPanel";
import { StatusBar } from "./components/StatusBar";

export function App() {
  const sidebarOpen = useShellStore((s) => s.sidebarOpen);
  const aiPanelOpen = useShellStore((s) => s.aiPanelOpen);

  useEffect(() => connectShellStore(), []);

  return (
    <div className="flex h-full flex-col bg-zinc-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Sidebar />}
        <ContentArea />
        {aiPanelOpen && <AIPanel />}
      </div>
      <StatusBar />
    </div>
  );
}
