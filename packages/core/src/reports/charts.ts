export interface Series {
  label: string;
  color: string;
  values: number[];
}

const fmtAxis = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : v.toFixed(v < 10 ? 1 : 0);

/** Server-side SVG line chart so PDFs render without client-side JavaScript. */
export function lineChartSvg(
  labels: string[],
  series: Series[],
  options: { width?: number; height?: number } = {},
): string {
  const width = options.width ?? 720;
  const height = options.height ?? 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const x = (i: number) => pad.left + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const gy = pad.top + innerH - f * innerH;
      return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${gy}" y2="${gy}" stroke="#e3e7ef"/><text x="${pad.left - 6}" y="${gy + 4}" font-size="10" text-anchor="end" fill="#5f6b7a">${fmtAxis(max * f)}</text>`;
    })
    .join('');
  const step = Math.max(1, Math.ceil(labels.length / 8));
  const xLabels = labels
    .map((l, i) =>
      i % step === 0 || i === labels.length - 1
        ? `<text x="${x(i)}" y="${height - 8}" font-size="10" text-anchor="middle" fill="#5f6b7a">${l.slice(5)}</text>`
        : '',
    )
    .join('');
  const lines = series
    .map((s) => {
      const d = s.values
        .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join(' ');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    })
    .join('');
  const legend = series
    .map(
      (s, i) =>
        `<rect x="${pad.left + i * 140}" y="2" width="10" height="10" fill="${s.color}" rx="2"/><text x="${pad.left + i * 140 + 14}" y="11" font-size="11" fill="#1a2233">${s.label}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 14}" width="100%" role="img"><g transform="translate(0,14)">${grid}${xLabels}${lines}</g>${legend}</svg>`;
}
