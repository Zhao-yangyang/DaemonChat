"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
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

function UsagePageContent() {
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
      description="按 Agent 快速查看 token 与成本趋势。"
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Agent</Label>
            <Select value={agentId || undefined} onValueChange={(value) => setAgentId(value)}>
              <SelectTrigger>
                <SelectValue placeholder={agents.isLoading ? "加载中..." : "选择 Agent"} />
              </SelectTrigger>
              <SelectContent>
                {(agents.data ?? []).map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>统计周期</Label>
            <Select value={period} onValueChange={(value) => setPeriod(value as UsagePeriod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">今日</SelectItem>
                <SelectItem value="month">本月</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { usage.refetch(); trend.refetch(); }}
              disabled={!agentId}
            >
              刷新
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {usage.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={`usage-loading-${idx}`}>
                <CardContent className="py-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {!usage.isLoading && agentId ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Tokens In</p>
                <p className="mt-1 text-2xl font-semibold">{formatNumber(usage.data?.tokensIn ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Tokens Out</p>
                <p className="mt-1 text-2xl font-semibold">{formatNumber(usage.data?.tokensOut ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Cost Estimate</p>
                <p className="mt-1 text-2xl font-semibold">{formatUsd(usage.data?.costEstimate ?? 0)}</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Token split */}
        {!usage.isLoading && agentId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Token Split</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Input</span>
                  <span>{Math.round(inRatio * 100)}%</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, inRatio * 100))} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Output</span>
                  <span>{Math.round(outRatio * 100)}%</span>
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, outRatio * 100))}
                  className="[&>div]:bg-(--accent-green)"
                />
              </div>
              <p className="text-xs text-muted-foreground">总 token：{formatNumber(totalTokens)}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Trend chart */}
        {!trend.isLoading && agentId ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Token Trend</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {period === "day" ? "按小时" : "按天"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {trendChart.polyline ? (
                <div className="overflow-x-auto">
                  <svg viewBox="0 0 640 260" className="min-w-[640px]">
                    <defs>
                      <linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="640" height="220" rx="8" fill="var(--secondary)" />
                    <path d={`M ${trendChart.fillPath}`} fill="url(#usage-fill)" />
                    <polyline
                      points={trendChart.polyline}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <line x1="0" y1="220" x2="640" y2="220" stroke="var(--border)" strokeWidth="1" />
                    {trendChart.labels.map((label, idx) => (
                      <text
                        key={`${label.text}-${idx}`}
                        x={label.x}
                        y="246"
                        textAnchor={idx === 0 ? "start" : idx === trendChart.labels.length - 1 ? "end" : "middle"}
                        style={{ fill: "var(--muted-foreground)" }}
                        className="text-[11px]"
                      >
                        {label.text}
                      </text>
                    ))}
                    <text
                      x="640"
                      y="16"
                      textAnchor="end"
                      style={{ fill: "var(--muted-foreground)" }}
                      className="text-[11px]"
                    >
                      峰值 {formatNumber(trendChart.maxValue)}
                    </text>
                  </svg>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">当前周期暂无数据。</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {!usage.isLoading && !hasAgents ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            你还没有 Agent。先去{" "}
            <Link href="/agents" className="text-primary underline underline-offset-4">Agents</Link>
            {" "}创建一个。
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

export default function UsagePage() {
  return (
    <Suspense
      fallback={
        <DashboardShell title="Usage & Cost" description="按 Agent 快速查看 token 与成本趋势。">
          <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Card key={`usage-page-fallback-${idx}`}>
                  <CardContent className="py-4">
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DashboardShell>
      }
    >
      <UsagePageContent />
    </Suspense>
  );
}
