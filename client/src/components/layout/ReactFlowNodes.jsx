import { memo } from 'react';
import { NodeResizer } from '@xyflow/react';
import { TableNode } from '../tables/TableNode.jsx';

const RESIZE_HANDLE_STYLE = Object.freeze({
  width: 30,
  height: 30,
  borderRadius: 999,
  border: '8px solid rgb(255 255 255 / 0.9)',
  background: '#0284c7',
  boxShadow: '0 2px 8px rgb(15 23 42 / 0.32)',
});

const RESIZE_LINE_STYLE = Object.freeze({
  borderColor: '#0284c7',
  borderWidth: 2,
});

export const FlowTableNode = memo(function FlowTableNode({ id, data, selected }) {
  const { table } = data;
  return (
    <div className="potx-flow-node potx-flow-table h-full w-full">
      <NodeResizer
        isVisible={data.editing && selected}
        minWidth={data.minWidth}
        minHeight={data.minHeight}
        maxWidth={data.maxWidth}
        maxHeight={data.maxHeight}
        keepAspectRatio={['round', 'square'].includes(table.shape)}
        autoScale
        handleStyle={RESIZE_HANDLE_STYLE}
        lineStyle={RESIZE_LINE_STYLE}
        onResizeStart={(_, params) => data.onResizeStart?.(id, params)}
        onResize={(_, params) => data.onResize?.(id, params)}
        onResizeEnd={(_, params) => data.onResizeEnd?.(id, params)}
      />
      <TableNode
        {...table}
        layout={undefined}
        embedded
        editing={data.editing}
        selected={data.uiSelected}
        timezone={data.timezone}
        onTableClick={data.onActivate}
        onTableDoubleClick={data.onDoubleActivate}
        onTableContextMenu={data.onTableContextMenu}
      />
    </div>
  );
});

const DECORATION_CLASSES = Object.freeze({
  wall: 'floor-wall rounded-full',
  entrance: 'rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50/80 text-emerald-800',
  cashier: 'rounded-xl border border-amber-400 bg-amber-100/80 text-amber-950 shadow-sm',
  area: 'rounded-3xl border border-dashed border-sky-300 bg-sky-100/20 text-sky-700/80',
  seat: 'rounded-[42%] border-2 border-slate-300 bg-white/70 shadow-[0_5px_12px_-8px_rgba(15,23,42,.45)]',
});

export const FlowDecorationNode = memo(function FlowDecorationNode({ id, data, selected }) {
  const item = data.item;
  return (
    <div className="potx-flow-node potx-flow-decoration h-full w-full">
      <NodeResizer
        isVisible={data.editing && selected}
        minWidth={data.minWidth}
        minHeight={data.minHeight}
        maxWidth={data.maxWidth}
        maxHeight={data.maxHeight}
        autoScale
        handleStyle={RESIZE_HANDLE_STYLE}
        lineStyle={RESIZE_LINE_STYLE}
        onResizeStart={(_, params) => data.onResizeStart?.(id, params)}
        onResize={(_, params) => data.onResize?.(id, params)}
        onResizeEnd={(_, params) => data.onResizeEnd?.(id, params)}
      />
      <button
        type="button"
        className={`h-full w-full select-none text-center font-black ${DECORATION_CLASSES[item.type]} ${data.uiSelected ? 'ring-4 ring-sky-500 ring-offset-2' : ''}`}
        style={{
          fontSize: 'clamp(10px, 1vw, 15px)',
          transform: `rotate(${item.rotation ?? 0}deg)`,
          touchAction: 'none',
        }}
        onClick={(event) => {
          event.stopPropagation();
          data.onActivate?.(item.id, event);
        }}
        aria-label={item.label}
      >
        {['wall', 'seat'].includes(item.type) ? null : (
          <span
            className="decoration-label"
            style={item.type === 'cashier' ? {
              transform: `rotate(${-(item.rotation ?? 0)}deg)`,
            } : undefined}
          >
            {item.label}
          </span>
        )}
      </button>
    </div>
  );
});

export const FlowCanvasSurfaceNode = memo(function FlowCanvasSurfaceNode({ data }) {
  const gridSize = Math.max(5, data.canvas.gridSize);
  return (
    <div
      className="floor-surface pointer-events-none h-full w-full overflow-hidden"
      style={{
        backgroundColor: data.canvas.backgroundColor,
        backgroundImage: data.canvas.gridEnabled && data.editing
          ? [
            'linear-gradient(to right, rgba(71,85,105,0.09) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(71,85,105,0.09) 1px, transparent 1px)',
          ].join(',')
          : undefined,
        backgroundSize: data.canvas.gridEnabled && data.editing
          ? `${gridSize}px ${gridSize}px`
          : undefined,
      }}
    />
  );
});

export const FlowGroupNode = memo(function FlowGroupNode({ data }) {
  return (
    <div className="pointer-events-none h-full w-full rounded-3xl border-2 border-dashed border-violet-500 bg-violet-500/5">
      <span className="absolute -top-6 left-2 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-black text-white shadow">
        {data.name}
      </span>
    </div>
  );
});
