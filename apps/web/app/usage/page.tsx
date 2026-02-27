"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import {
  parseUsageQueryState,
  toUsageSearchParams,
} from "@/src/features/historyQueryState";

type UsagePeriod = "day" | "month";

const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(Math.round(value));
const formatUsd = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);

const formatBucketLabel = (value: string, period: UsagePeriod): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (period === "day") {
    return `${String(date.getHours()).padStart(2, "0")}:00`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

export default function UsagePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsed = useMemo(() => parseUsageQueryState(searchParams), [searchParams]);

  const agents = trpc.agent.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [agentId, setAgentId] = useState(parsed.agentId);
  const [period, setPeriod] = useState<UsagePeriod>(parsed.period);

  const usage = trpc.usage.summary.useQuery(
    { agentId, period },
    { enabled: Boolean(agentId) }
  );
  const trend = trpc.usage.trend.useQuery(
    { agentId, period },
    { enabled: Boolean(agentId) }
  );

  useEffect(() => {
    if (parsed.agentId) {
      setAgentId((prev) => (prev === parsed.agentId ? prev : parsed.agentId));
    }
    setPeriod((prev) => (prev === parsed.period ? prev : parsed.period));
  }, [parsed]);

  useEffect(() => {
    if (!agentId && (agents.data?.length ?? 0) > 0) {
      setAgentId(agents.data![0]!.id);
    }
  }, [agentId, agents.data]);

  useEffect(() => {
    const next = toUsageSearchParams({ agentId, period }).toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [agentId, period, pathname, router, searchParams]);

  const totalTokens = (usage.data?.tokensIn ?? 0) + (usage.data?.tokensOut ?? 0);
  const inRatio = totalTokens > 0 ? (usage.data?.tokensIn ?? 0) / totalTokens : 0;
  const outRatio = totalTokens > 0 ? (usage.data?.tokensOut ?? 0) / totalTokens : 0;

  const trendChart = useMemo(() => {
    const data = trend.data ?? [];
    if (data.length === 0) {
      return {
        polyline: "",
        fillPath: "",
        labels: [] as Array<{ x: number; text: string }>,
        maxValue: 0,
      };
    }

    const width = 640;
    const height = 220;
    const values = data.map((point) => (point.tokensIn ?? 0) + (point.tokensOut ?? 0));
    const maxValue = Math.max(...values, 1);
    const stepX = data.length > 1 ? width / (data.length - 1) : width;
    const points = values.map((value, index) => {
      const x = data.length === 1 ? width / 2 : index * stepX;
      const y = height - (value / maxValue) * height;
      return { x, y };
    });

    const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
    const fillPath = `${polyline} ${width},${height} 0,${height}`;
    const labelIndexes = Array.from(
      new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])
    );
    const labels = labelIndexes
      .map((index) => data[index])
      .filter((item): item is (typeof data)[number] => Boolean(item))
      .map((item, labelIndex) => ({
        x:
          labelIndex === 0
            ? 0
            : labelIndex === 1
              ? width / 2
              : width,
        text: formatBucketLabel(item.bucketStart, period),
      }));

    return { polyline, fillPath, labels, maxValue };
  }, [trend.data, period]);

  const hasAgents = (agents.data?.length ?? 0) > 0;

  return (
    <DashboardShell
      title="Usage & Cost"
      description="直接选择 Agent 查看成本，不再需要手动复制 ID。"
      actions={
        <Button asChild variant="outline" className="border-[var(--line-soft)] bg-white">
          <Link href="/agents">管理 Agent</Link>
        </Button>
      }
    >
      <section className="space-y-4">
        <Card className="border-[var(--line-soft)] bg-white/92 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={agentId || undefined} onValueChange={(value) => setAgentId(value)}>
              <SelectTrigger className="h-10 border-[var(--line-soft)] bg-white">
                <SelectValue placeholder={agents.isLoading ? "加载 Agent..." : "选择 Agent"} />
              </SelectTrigger>
              <SelectContent>
                {(agents.data ?? []).map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(value) => setPeriod(value as UsagePeriod)}>
              <SelectTrigger className="h-10 border-[var(--line-soft)] bg-white">
                <SelectValue placeholder="统计周期" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">今日</SelectItem>
                <SelectItem value="month">本月</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="border-[var(--line-soft)] bg-white"
              onClick={() => {
                usage.refetch();
                trend.refetch();
              }}
              disabled={!agentId}
            >
              刷新
            </Button>
          </div>
        </Card>

        {agentId ? (
          <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
              Agent {(agents.data ?? []).find((item) => item.id === agentId)?.name ?? agentId}
            </Badge>
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
              范围：{period === "day" ? "今天" : "当月"}
            </Badge>
          </div>
        ) : null}

        {usage.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card
                key={`usage-loading-${idx}`}
                className="h-28 animate-pulse border-[var(--line-soft)] bg-white/70"
              />
            ))}
          </div>
        ) : null}

        {!usage.isLoading && agentId ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="space-y-1 border-[var(--line-soft)] bg-white/95 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">Tokens In</p>
              <p className="text-3xl font-semibold text-[var(--ink-strong)]">
                {formatNumber(usage.data?.tokensIn ?? 0)}
              </p>
            </Card>
            <Card className="space-y-1 border-[var(--line-soft)] bg-white/95 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">Tokens Out</p>
              <p className="text-3xl font-semibold text-[var(--ink-strong)]">
                {formatNumber(usage.data?.tokensOut ?? 0)}
              </p>
            </Card>
            <Card className="space-y-1 border-[var(--line-soft)] bg-white/95 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">Cost Estimate</p>
              <p className="text-3xl font-semibold text-[var(--ink-strong)]">
                {formatUsd(usage.data?.costEstimate ?? 0)}
              </p>
            </Card>
          </div>
        ) : null}

        {!usage.isLoading && agentId ? (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="space-y-4 border-[var(--line-soft)] bg-white/95 p-5">
              <p className="text-sm font-semibold text-[var(--ink-strong)]">Token Split</p>
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--brand)]"
                    style={{ width: `${Math.max(0, Math.min(100, inRatio * 100))}%` }}
                  />
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.max(0, Math.min(100, outRatio * 100))}%` }}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--brand-soft)]/55 p-3 text-sm text-[var(--ink-muted)]">
                  In {Math.round(inRatio * 100)}%
                </div>
                <div className="rounded-xl border border-[var(--line-soft)] bg-amber-50 p-3 text-sm text-[var(--ink-muted)]">
                  Out {Math.round(outRatio * 100)}%
                </div>
              </div>
            </Card>

            <Card className="space-y-3 border-[var(--line-soft)] bg-white/95 p-5 text-sm text-[var(--ink-muted)]">
              <p className="font-semibold text-[var(--ink-strong)]">Usage Notes</p>
              <p>总 token：{formatNumber(totalTokens)}</p>
              <p>
                若你开启了硬上限、预算降级或 fallback 路由，可在审计与 usage meta 中看到决策记录。
              </p>
            </Card>
          </div>
        ) : null}

        {!trend.isLoading && agentId ? (
          <Card className="space-y-4 border-[var(--line-soft)] bg-white/95 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink-strong)]">Token Trend</p>
              <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
                {period === "day" ? "按小时" : "按天"}
              </Badge>
            </div>
            {trendChart.polyline ? (
              <div className="overflow-x-auto">
                <svg viewBox="0 0 640 260" className="min-w-[640px]">
                  <defs>
                    <linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.03" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="640" height="220" rx="12" fill="#f8fafc" />
                  <path d={`M ${trendChart.fillPath}`} fill="url(#usage-fill)" />
                  <polyline
                    points={trendChart.polyline}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <line x1="0" y1="220" x2="640" y2="220" stroke="#dbe3f0" strokeWidth="1" />
                  {trendChart.labels.map((label, idx) => (
                    <text
                      key={`${label.text}-${idx}`}
                      x={label.x}
                      y="246"
                      textAnchor={idx === 0 ? "start" : idx === trendChart.labels.length - 1 ? "end" : "middle"}
                      className="fill-slate-500 text-[12px]"
                    >
                      {label.text}
                    </text>
                  ))}
                  <text x="640" y="16" textAnchor="end" className="fill-slate-500 text-[12px]">
                    峰值 {formatNumber(trendChart.maxValue)}
                  </text>
                </svg>
              </div>
            ) : (
              <p className="text-sm text-[var(--ink-muted)]">当前周期暂无可视化数据。</p>
            )}
          </Card>
        ) : null}

        {!usage.isLoading && !hasAgents ? (
          <Card className="border-[var(--line-soft)] bg-white/86 p-5 text-sm text-[var(--ink-muted)]">
            你还没有 Agent。先去 <Link href="/agents" className="text-[var(--brand)] underline">Agents</Link> 创建一个。
          </Card>
        ) : null}
      </section>
    </DashboardShell>
  );
}
