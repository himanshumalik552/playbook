import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import type { DailyPoint, KpiKey } from '@adpulse/types';
import { visuallyHidden } from '@adpulse/ui';
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import { formatDate, useFormat } from '@/lib/format';
import { EChart } from './EChart';

interface TrendChartProps {
  data: DailyPoint[];
  previous?: DailyPoint[] | null;
  metric: KpiKey;
  height?: number;
}

function ChartTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <Box component="table" sx={visuallyHidden}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, rowIndex) => (
          <tr key={`${r[0]}-${rowIndex}`}>
            {r.map((c, i) => (
              <td key={i}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

/** Daily trend of one metric, optionally overlaid with the aligned previous period. */
export function TrendChart({ data, previous, metric, height = 300 }: TrendChartProps) {
  const theme = useTheme();
  const f = useFormat();
  const def = METRIC_DEFINITIONS[metric];

  const option = useMemo(() => {
    const primary = theme.palette.primary.main;
    return {
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number | null) => f.metric(metric, v),
      },
      legend: { top: 0, right: 0, textStyle: { color: theme.palette.text.secondary } },
      xAxis: {
        type: 'category',
        data: data.map((d) => formatDate(d.date, 'd MMM')),
        axisLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: { color: theme.palette.text.secondary },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: {
          color: theme.palette.text.secondary,
          formatter: (v: number) => f.metric(metric, v, true),
        },
      },
      series: [
        {
          name: 'Selected period',
          type: 'line',
          smooth: true,
          showSymbol: data.length < 20,
          data: data.map((d) => d[metric]),
          lineStyle: { width: 2.5, color: primary },
          itemStyle: { color: primary },
          areaStyle: { color: alpha(primary, 0.12) },
        },
        ...(previous
          ? [
              {
                name: 'Previous period',
                type: 'line',
                smooth: true,
                showSymbol: false,
                data: previous.map((d) => d[metric]),
                lineStyle: { width: 1.5, type: 'dashed', color: theme.palette.text.secondary },
                itemStyle: { color: theme.palette.text.secondary },
              },
            ]
          : []),
      ],
    };
  }, [data, previous, metric, theme, f]);

  return (
    <>
      <EChart option={option} height={height} ariaLabel={`${def.label} per day`} />
      <ChartTable
        caption={`${def.label} per day`}
        headers={['Date', 'Selected period', ...(previous ? ['Previous period'] : [])]}
        rows={data.map((d, i) => [
          d.date,
          f.metric(metric, d[metric]),
          ...(previous ? [f.metric(metric, previous[i]?.[metric] ?? null)] : []),
        ])}
      />
    </>
  );
}

/** Daily spend (bars) against conversion value (line). */
export function SpendValueChart({ data, height = 300 }: { data: DailyPoint[]; height?: number }) {
  const theme = useTheme();
  const f = useFormat();
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => f.currency(v) },
      legend: { top: 0, right: 0, textStyle: { color: theme.palette.text.secondary } },
      xAxis: {
        type: 'category',
        data: data.map((d) => formatDate(d.date, 'd MMM')),
        axisLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: { color: theme.palette.text.secondary },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: { color: theme.palette.text.secondary, formatter: (v: number) => f.currency(v, true) },
      },
      series: [
        {
          name: 'Spend',
          type: 'bar',
          data: data.map((d) => d.cost),
          itemStyle: { color: alpha(theme.palette.primary.main, 0.55), borderRadius: [3, 3, 0, 0] },
        },
        {
          name: 'Conversion value',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: data.map((d) => d.conversionValue),
          lineStyle: { width: 2.5, color: theme.palette.success.main },
          itemStyle: { color: theme.palette.success.main },
        },
      ],
    }),
    [data, theme, f],
  );
  return (
    <>
      <EChart option={option} height={height} ariaLabel="Daily spend compared with conversion value" />
      <ChartTable
        caption="Daily spend and conversion value"
        headers={['Date', 'Spend', 'Conversion value']}
        rows={data.map((d) => [d.date, f.currency(d.cost), f.currency(d.conversionValue)])}
      />
    </>
  );
}

/** Horizontal bars for a breakdown (devices, locations, …). */
export function BreakdownBarChart({
  rows,
  metric,
  height = 260,
}: {
  rows: { label: string; value: number | null }[];
  metric: KpiKey;
  height?: number;
}) {
  const theme = useTheme();
  const f = useFormat();
  const def = METRIC_DEFINITIONS[metric];
  const top = rows.slice(0, 10).reverse();
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: number | null) => f.metric(metric, v),
      },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: {
          color: theme.palette.text.secondary,
          formatter: (v: number) => f.metric(metric, v, true),
        },
      },
      yAxis: {
        type: 'category',
        data: top.map((r) => r.label),
        axisLabel: { color: theme.palette.text.secondary, width: 140, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          name: def.label,
          data: top.map((r) => r.value),
          itemStyle: { color: theme.palette.primary.main, borderRadius: [0, 3, 3, 0] },
        },
      ],
    }),
    [top, theme, f, metric, def.label],
  );
  return (
    <>
      <EChart option={option} height={height} ariaLabel={`${def.label} by segment`} />
      <ChartTable
        caption={`${def.label} by segment`}
        headers={['Segment', def.label]}
        rows={rows.map((r) => [r.label, f.metric(metric, r.value)])}
      />
    </>
  );
}
