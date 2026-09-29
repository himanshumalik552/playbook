import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export type EChartOption = echarts.EChartsCoreOption;

export interface EChartProps {
  option: EChartOption;
  height?: number;
  /** Short description announced to assistive technology; the data itself is offered as a table. */
  ariaLabel: string;
}

export function EChart({ option, height = 300, ariaLabel }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const theme = useTheme();
  const mode = theme.palette.mode;

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, mode === 'dark' ? 'dark' : undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [mode]);

  useEffect(() => {
    chart.current?.setOption(
      {
        backgroundColor: 'transparent',
        textStyle: { fontFamily: theme.typography.fontFamily },
        ...option,
      },
      { notMerge: true },
    );
  }, [option, mode, theme.typography.fontFamily]);

  return <Box ref={ref} role="img" aria-label={ariaLabel} sx={{ width: '100%', height }} />;
}
