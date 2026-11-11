import { useId } from 'react';

const points = [[70, 145], [155, 70], [175, 230], [280, 38], [300, 263], [413, 73], [448, 215], [545, 135], [80, 252], [525, 255], [512, 45], [55, 54]];
const links = [[0, 1], [0, 2], [1, 3], [2, 4], [5, 7], [6, 7], [6, 9], [5, 10], [0, 11], [2, 8]];

export function NetworkMotif({ className = '' }: { className?: string }) {
  const titleId = useId();
  return (
    <svg className={`network-motif ${className}`} viewBox="0 0 600 300" role="img" aria-labelledby={titleId}>
      <title id={titleId}>Illustration of a transaction and its two-hop neighborhood, not indexed transaction data</title>
      <g className="network-ring">
        <circle cx="310" cy="150" r="56" />
        <circle cx="310" cy="150" r="110" strokeDasharray="3 6" />
        <circle cx="310" cy="150" r="168" />
      </g>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
        const [x, y] = points[index];
        const path = `M310 150 L${x} ${y}`;
        return <g key={index}><path d={path} className="network-line" /><path d={path} className="network-flow" pathLength={170} style={{ animationDelay: `${index * -.5}s` }} /></g>;
      })}
      {links.map(([a, b], index) => <path key={index} d={`M${points[a][0]} ${points[a][1]} L${points[b][0]} ${points[b][1]}`} className="network-line" />)}
      {points.map(([x, y], index) => <g key={index}>
        <circle cx={x} cy={y} r={index > 7 ? 4 : 8} className="network-node" opacity={index > 7 ? .4 : .8} />
        {index <= 7 && <circle cx={x} cy={y} r={2} className="network-dot" />}
      </g>)}
      <circle cx="310" cy="150" r="38" className="network-halo" />
      <rect x="287" y="127" width="46" height="46" rx="12" className="network-center" />
      <path d="M300 139L320 161M319 139L301 161" stroke="var(--accent-primary)" strokeWidth="3" strokeLinecap="round" />
      <text x="310" y="196" textAnchor="middle">ORIGIN</text>
      <text x="430" y="148">1 HOP</text>
      <text x="495" y="179">2 HOPS</text>
    </svg>
  );
}
