import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { initApiClient } from "@/lib/api-bootstrap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "InfinityMart Sales Management 360" },
      {
        name: "description",
        content:
          "POS, inventory, HRM, accounting, and reporting in one InfinityMart Sales Management 360 platform.",
      },
      { property: "og:url", content: "https://infinitysales-pro.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://infinitysales-pro.lovable.app/" }],
  }),
  component: Home,
});

function Home() {
  const [Mounted, setMounted] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    initApiClient();
    let active = true;
    import("@/DashboardApp").then((m) => {
      if (active) setMounted(() => m.default);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!Mounted) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        Loading...
      </div>
    );
  }
  return <Mounted />;
}
