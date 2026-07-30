import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Maximize2,
  Minus,
  Plus,
  ScanLine,
} from 'lucide-react';
import {
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch';
import { Rnd } from 'react-rnd';
import { useCanvasScale } from '../../hooks/useCanvasScale.js';
import { TableNode } from '../tables/TableNode.jsx';

function ZoomControls({
  zoomIn,
  zoomOut,
  centerView,
  fitScale,
  actualSizeScale,
  transformScale,
}) {
  const displayPercent = Math.round(
    fitScale * transformScale * 100,
  );

  return (
    <div
      className="canvas-control absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-soft backdrop-blur"
      data-canvas-control
    >
      <button
        type="button"
        onClick={() => zoomOut(0.2, 180)}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        aria-label="缩小画布"
      >
        <Minus size={17} />
      </button>
      <span className="min-w-14 text-center font-mono text-xs font-bold tabular-nums text-ink-900">
        {displayPercent}%
      </span>
      <button
        type="button"
        onClick={() => zoomIn(0.2, 180)}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        aria-label="放大画布"
      >
        <Plus size={17} />
      </button>
      <span className="mx-0.5 h-6 w-px bg-stone-200" />
      <button
        type="button"
        onClick={() => centerView(1, 220, 'easeOut')}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        title="适应屏幕"
        aria-label="画布适应屏幕"
      >
        <Maximize2 size={17} />
      </button>
      <button
        type="button"
        onClick={() => centerView(actualSizeScale, 220, 'easeOut')}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        title="虚拟像素 100%"
        aria-label="画布显示为百分之百"
      >
        <ScanLine size={17} />
      </button>
    </div>
  );
}

export function FloorCanvas({
  canvas,
  tables,
  decorations = [],
  timezone,
  onTableClick,
  editing = false,
  selectedTableId = null,
  onSelectTable,
  onUpdateTableLayout,
  selectedDecorationId = null,
  onSelectDecoration,
  onUpdateDecoration,
}) {
  const viewportRef = useRef(null);
  const lastZoomUpdateRef = useRef(0);
  const zoomUpdateTimerRef = useRef(null);
  const pendingScaleRef = useRef(1);
  const scaleRef = useRef(1);
  const [transformScale, setTransformScale] = useState(1);
  const {
    fitScale,
    width,
    height,
    actualSizeScale,
  } = useCanvasScale(viewportRef, canvas);
  const maxScale = Math.max(
    4,
    Math.min(8, actualSizeScale),
  );
  const gridStyle = useMemo(() => {
    if (!canvas.gridEnabled) {
      return {};
    }

    const gridSize = Math.max(2, canvas.gridSize * fitScale);
    return {
      backgroundImage: [
        'linear-gradient(to right, rgba(71,85,105,0.09) 1px, transparent 1px)',
        'linear-gradient(to bottom, rgba(71,85,105,0.09) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: `${gridSize}px ${gridSize}px`,
    };
  }, [canvas.gridEnabled, canvas.gridSize, fitScale]);
  const groupBounds = useMemo(() => {
    const grouped = new Map();
    for (const table of tables) {
      if (!table.groupId) continue;
      const current = grouped.get(table.groupId) ?? {
        id: table.groupId,
        name: table.groupName,
        left: 1,
        top: 1,
        right: 0,
        bottom: 0,
      };
      current.left = Math.min(current.left, table.layout.xRatio);
      current.top = Math.min(current.top, table.layout.yRatio);
      current.right = Math.max(
        current.right,
        table.layout.xRatio + table.layout.widthRatio,
      );
      current.bottom = Math.max(
        current.bottom,
        table.layout.yRatio + table.layout.heightRatio,
      );
      grouped.set(table.groupId, current);
    }
    return [...grouped.values()];
  }, [tables]);

  useEffect(() => () => {
    if (zoomUpdateTimerRef.current) {
      clearTimeout(zoomUpdateTimerRef.current);
    }
  }, []);

  const queueScaleDisplayUpdate = (scale) => {
    pendingScaleRef.current = scale;
    const elapsed = Date.now() - lastZoomUpdateRef.current;

    if (elapsed >= 200) {
      lastZoomUpdateRef.current = Date.now();
      setTransformScale(scale);
      return;
    }

    if (!zoomUpdateTimerRef.current) {
      zoomUpdateTimerRef.current = setTimeout(() => {
        zoomUpdateTimerRef.current = null;
        lastZoomUpdateRef.current = Date.now();
        setTransformScale(pendingScaleRef.current);
      }, 200 - elapsed);
    }
  };

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-0 w-full touch-none overflow-hidden rounded-[1.75rem] shadow-inner"
      style={{
        backgroundColor: canvas.backgroundColor,
        ...gridStyle,
      }}
      aria-label="门店桌台布局画布"
    >
      <TransformWrapper
        key={`${canvas.virtualWidth}:${canvas.virtualHeight}`}
        minScale={0.5}
        maxScale={maxScale}
        initialScale={1}
        centerOnInit
        centerZoomedOut
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        panning={{
          disabled: false,
          velocityDisabled: false,
          excluded: [
            'table-node',
            'canvas-control',
            'potx-table-node',
            'potx-decoration-node',
          ],
        }}
        pinch={{ excluded: ['table-node', 'canvas-control', 'potx-decoration-node'] }}
        wheel={{ step: 0.12, excluded: ['canvas-control'] }}
        onInit={(ref) => {
          scaleRef.current = ref.state.scale;
          setTransformScale(ref.state.scale);
        }}
        onTransformed={(_, state) => {
          if (Math.abs(scaleRef.current - state.scale) < 0.0001) {
            return;
          }

          scaleRef.current = state.scale;
          queueScaleDisplayUpdate(state.scale);
        }}
        onZoomStop={(ref) => {
          scaleRef.current = ref.state.scale;
          setTransformScale(ref.state.scale);
        }}
      >
        {({
          zoomIn,
          zoomOut,
          centerView,
        }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{
                width,
                height,
              }}
            >
              <div
                className="relative overflow-hidden rounded-2xl"
                style={{
                  width,
                  height,
                  backgroundColor: canvas.backgroundColor,
                  ...gridStyle,
                }}
                onDoubleClick={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  const nextScale = Math.abs(scaleRef.current - 1) < 0.05
                    ? actualSizeScale
                    : 1;
                  centerView(nextScale, 240, 'easeOut');
                }}
                onClick={(event) => {
                  if (editing && event.target === event.currentTarget) {
                    onSelectTable?.(null);
                    onSelectDecoration?.(null);
                  }
                }}
              >
                {decorations.map((item) => {
                  const content = (
                    <div
                      className={[
                        'flex h-full w-full select-none items-center justify-center text-center font-black',
                        item.type === 'wall' ? 'rounded-full bg-stone-700' : '',
                        item.type === 'entrance' ? 'rounded-xl border-4 border-dashed border-emerald-600 bg-emerald-50 text-emerald-800' : '',
                        item.type === 'cashier' ? 'rounded-xl border-2 border-amber-700 bg-amber-100 text-amber-950 shadow' : '',
                        item.type === 'area' ? 'rounded-3xl border-2 border-dashed border-sky-400 bg-sky-100/20 text-sky-700' : '',
                        selectedDecorationId === item.id ? 'ring-4 ring-sky-500 ring-offset-2' : '',
                      ].join(' ')}
                      style={{
                        fontSize: 'clamp(10px, 1vw, 15px)',
                        transform: `rotate(${item.rotation ?? 0}deg)`,
                      }}
                    >
                      {item.type === 'wall' ? null : item.label}
                    </div>
                  );

                  if (!editing) {
                    return (
                      <div
                        key={item.id}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${item.xRatio * 100}%`,
                          top: `${item.yRatio * 100}%`,
                          width: `${item.widthRatio * 100}%`,
                          height: `${item.heightRatio * 100}%`,
                          zIndex: item.zIndex,
                        }}
                      >
                        {content}
                      </div>
                    );
                  }

                  const gridStep = canvas.snapToGrid
                    ? Math.max(1, canvas.gridSize * fitScale)
                    : 1;
                  return (
                    <Rnd
                      key={item.id}
                      className="potx-decoration-node"
                      bounds="parent"
                      position={{
                        x: item.xRatio * width,
                        y: item.yRatio * height,
                      }}
                      size={{
                        width: item.widthRatio * width,
                        height: item.heightRatio * height,
                      }}
                      scale={transformScale}
                      dragGrid={[gridStep, gridStep]}
                      resizeGrid={[gridStep, gridStep]}
                      minWidth={item.type === 'wall' ? 30 : 70}
                      minHeight={item.type === 'wall' ? 8 : 35}
                      style={{ zIndex: item.zIndex }}
                      onMouseDown={() => onSelectDecoration?.(item.id)}
                      onDragStop={(_, data) => onUpdateDecoration?.(item.id, {
                        xRatio: data.x / width,
                        yRatio: data.y / height,
                      })}
                      onResizeStop={(_, __, element, ___, position) => (
                        onUpdateDecoration?.(item.id, {
                          xRatio: position.x / width,
                          yRatio: position.y / height,
                          widthRatio: element.offsetWidth / width,
                          heightRatio: element.offsetHeight / height,
                        })
                      )}
                    >
                      {content}
                    </Rnd>
                  );
                })}
                {groupBounds.map((group) => {
                  const padding = 0.008;
                  const left = Math.max(0, group.left - padding);
                  const top = Math.max(0, group.top - padding);
                  const right = Math.min(1, group.right + padding);
                  const bottom = Math.min(1, group.bottom + padding);
                  return (
                    <div
                      key={group.id}
                      className="pointer-events-none absolute rounded-3xl border-2 border-dashed border-violet-500 bg-violet-500/5"
                      style={{
                        left: `${left * 100}%`,
                        top: `${top * 100}%`,
                        width: `${(right - left) * 100}%`,
                        height: `${(bottom - top) * 100}%`,
                        zIndex: 0,
                      }}
                    >
                      <span className="absolute -top-6 left-2 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-black text-white shadow">
                        {group.name}
                      </span>
                    </div>
                  );
                })}
                {tables.map((table) => {
                  if (!editing) {
                    return (
                      <TableNode
                        key={table.tableId}
                        {...table}
                        timezone={timezone}
                        onTableClick={onTableClick}
                      />
                    );
                  }

                  const gridStep = canvas.snapToGrid
                    ? Math.max(1, canvas.gridSize * fitScale)
                    : 1;
                  const position = {
                    x: table.layout.xRatio * width,
                    y: table.layout.yRatio * height,
                  };
                  const size = {
                    width: table.layout.widthRatio * width,
                    height: table.layout.heightRatio * height,
                  };

                  return (
                    <Rnd
                      key={table.tableId}
                      className="potx-table-node"
                      bounds="parent"
                      position={position}
                      size={size}
                      scale={transformScale}
                      dragGrid={[gridStep, gridStep]}
                      resizeGrid={[gridStep, gridStep]}
                      minWidth={canvas.minTableWidth * fitScale}
                      minHeight={canvas.minTableHeight * fitScale}
                      maxWidth={canvas.maxTableWidth * fitScale}
                      maxHeight={canvas.maxTableHeight * fitScale}
                      lockAspectRatio={
                        ['round', 'square'].includes(table.shape) ? 1 : false
                      }
                      style={{ zIndex: table.layout.zIndex }}
                      onDragStart={() => {
                        onSelectTable?.(table.tableId);
                        onUpdateTableLayout?.(table.tableId, {
                          ...table.layout,
                          bringToFront: true,
                        });
                      }}
                      onDragStop={(_, data) => {
                        onUpdateTableLayout?.(table.tableId, {
                          ...table.layout,
                          xRatio: data.x / width,
                          yRatio: data.y / height,
                        });
                      }}
                      onResizeStart={() => onSelectTable?.(table.tableId)}
                      onResizeStop={(_, __, element, ___, nextPosition) => {
                        onUpdateTableLayout?.(table.tableId, {
                          ...table.layout,
                          xRatio: nextPosition.x / width,
                          yRatio: nextPosition.y / height,
                          widthRatio: element.offsetWidth / width,
                          heightRatio: element.offsetHeight / height,
                          bringToFront: true,
                        });
                      }}
                    >
                      <TableNode
                        {...table}
                        embedded
                        selected={selectedTableId === table.tableId}
                        timezone={timezone}
                        onTableClick={() => onSelectTable?.(table.tableId)}
                      />
                    </Rnd>
                  );
                })}
              </div>
            </TransformComponent>
            <ZoomControls
              zoomIn={zoomIn}
              zoomOut={zoomOut}
              centerView={centerView}
              fitScale={fitScale}
              actualSizeScale={actualSizeScale}
              transformScale={transformScale}
            />
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
