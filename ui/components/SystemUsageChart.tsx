import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SystemMetric } from "../types";

interface SystemUsageChartProps {
  metrics?: Array<{
    timestamp: number;
    cpu: number;
    gpu: number;
    memory: number;
  }> | null;
}

const SystemUsageChart: React.FC<SystemUsageChartProps> = ({ metrics }) => {
  const [data, setData] = useState<SystemMetric[]>([]);

  useEffect(() => {
    // Generate initial data for live system monitoring
    const initialData = Array.from({ length: 20 }, (_, i) => ({
      time: new Date(Date.now() - (20 - i) * 1000).toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      cpu: 20 + Math.random() * 10,
      memory: 40 + Math.random() * 5,
      gpu: 10 + Math.random() * 5,
    }));
    setData(initialData);

    const interval = setInterval(() => {
      setData((prevData) => {
        const now = new Date();
        const newPoint: SystemMetric = {
          time: now.toLocaleTimeString([], {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          cpu: Math.min(
            100,
            Math.max(
              0,
              prevData[prevData.length - 1].cpu + (Math.random() - 0.5) * 15
            )
          ),
          memory: Math.min(
            100,
            Math.max(
              0,
              prevData[prevData.length - 1].memory + (Math.random() - 0.5) * 5
            )
          ),
          gpu: Math.min(
            100,
            Math.max(
              0,
              prevData[prevData.length - 1].gpu + (Math.random() - 0.5) * 20
            )
          ),
        };
        return [...prevData.slice(1), newPoint];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 160, background: "linear-gradient(145deg,#0b0b1a,#0d0d20)", border: "1px solid rgba(139,92,246,0.18)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
          System Resources
        </h3>
        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#34d399" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 6px #10b981" }}></span> CPU
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#22d3ee" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#06b6d4", display: "inline-block", boxShadow: "0 0 6px #06b6d4" }}></span> GPU
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#c084fc" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a855f7", display: "inline-block", boxShadow: "0 0 6px #a855f7" }}></span> MEM
          </span>
        </div>
      </div>

      <div style={{ flex: 1, width: "100%", minHeight: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorGpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="#52525b"
              tick={{ fill: "#52525b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#52525b"
              tick={{ fill: "#52525b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                borderColor: "#27272a",
                color: "#e4e4e7",
              }}
              itemStyle={{ fontSize: "12px" }}
            />
            <Area
              type="monotone"
              dataKey="cpu"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorCpu)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="gpu"
              stroke="#06b6d4"
              fillOpacity={1}
              fill="url(#colorGpu)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="memory"
              stroke="#a855f7"
              fillOpacity={1}
              fill="url(#colorMem)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SystemUsageChart;
