import { useState, useEffect, useRef, useCallback } from "react";
import { customFetch } from "@/workspace/api-client-react";

export interface PosDevice {
  id: string;
  name: string;
  deviceType: string;
  ip?: string;
  connectedAt: number;
  lastSeen: number;
}

function playConnectionSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.setValueAtTime(1100, now + 0.12);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
    gain.gain.setValueAtTime(0.35, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc1.start(now);
    osc1.stop(now + 0.15);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);

    setTimeout(() => ctx.close(), 800);
  } catch {}
}

export function usePosConnection(pollIntervalMs = 10000, enabled = true) {
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const prevCountRef = useRef<number | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await customFetch<{ devices: PosDevice[]; total: number }>(
        "/api/pos/connections",
      );
      if (data && Array.isArray(data.devices)) {
        setDevices(data.devices);

        if (prevCountRef.current !== null && data.devices.length > prevCountRef.current) {
          playConnectionSound();
        }
        prevCountRef.current = data.devices.length;
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async (id: string) => {
    try {
      await customFetch(`/api/pos/connections/${id}`, { method: "DELETE" } as Parameters<
        typeof customFetch
      >[1]);
      setDevices((prev) => prev.filter((d) => d.id !== id));
      if (prevCountRef.current !== null)
        prevCountRef.current = Math.max(0, prevCountRef.current - 1);
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchDevices();
    const id = setInterval(fetchDevices, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchDevices, pollIntervalMs, enabled]);

  return { devices, isLoading, refetch: fetchDevices, disconnect };
}
