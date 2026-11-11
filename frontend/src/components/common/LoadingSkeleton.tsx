import React from 'react';

export const PageSkeleton: React.FC<{ cards?: number }> = ({ cards = 4 }) => (
  <div className="workspace-page space-y-6" role="status" aria-label="Loading workspace">
    <span className="sr-only">Loading workspace</span>
    <div className="space-y-3 pb-4">
      <div className="h-3 w-32 bg-elevated rounded animate-pulse" />
      <div className="h-10 w-72 max-w-full skeleton" />
      <div className="h-4 w-96 max-w-full bg-elevated rounded animate-pulse" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="panel-surface p-5 space-y-4 h-36 skeleton">
          <div className="h-3 w-20 bg-elevated rounded" />
          <div className="h-6 w-28 bg-elevated rounded" />
        </div>
      ))}
    </div>

    <div className="panel-surface p-5 h-80 skeleton" />
  </div>
);

export const TableRowsSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 8,
  cols = 8,
}) => (
  <>
    {Array.from({ length: rows }).map((_, rIdx) => (
      <tr key={rIdx}>
        {Array.from({ length: cols }).map((__, cIdx) => (
          <td key={cIdx}>
            <div className="h-3.5 bg-elevated rounded animate-pulse w-4/5" />
          </td>
        ))}
      </tr>
    ))}
  </>
);
