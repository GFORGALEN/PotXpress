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
import { scaleTableSelection } from '../../utils/layoutEditor.js';
import { TableNode } from '../tables/TableNode.jsx';

function getClientPoint(event) {
  const point = event?.changedTouches?.[0] ?? event?.touches?.[0] ?? event;
  return {
    x: point?.clientX ?? 0,
    y: point?.clientY ?? 0,
  };
}

function ZoomControls({
  zoomIn,
  zoomOut,
  fitView,
  fitScale,
  actualSizeScale,
  transformScale,
  editing,
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
        onClick={() => fitView()}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        title="适应屏幕"
        aria-label="画布适应屏幕"
      >
        <Maximize2 size={17} />
      </button>
      {editing ? (
        <button
          type="button"
          onClick={() => fitView(actualSizeScale)}
          className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
          title="虚拟像素 100%"
          aria-label="画布显示为百分之百"
        >
          <ScanLine size={17} />
        </button>
      ) : null}
    </div>
  );
}

export function FloorCanvas({
  canvas,
  tables,
  fitTables = tables,
  decorations = [],
  timezone,
  onTableClick,
  onCanvasContextMenu,
  onTableContextMenu,
  editing = false,
  selectedTableId = null,
  selectedTableIds = [],
  onSelectTable,
  onSelectTables,
  onUpdateTableLayout,
  onMoveSelectedTables,
  syncSelectedResize = false,
  onResizeSelectedTables,
  immersive = false,
  selectedDecorationId = null,
  onSelectDecoration,
  onUpdateDecoration,
}) {
  const viewportRef = useRef(null);
  const surfaceRef = useRef(null);
  const transformApiRef = useRef(null);
  const lastZoomUpdateRef = useRef(0);
  const zoomUpdateTimerRef = useRef(null);
  const transformSettleTimerRef = useRef(null);
  const pendingScaleRef = useRef(1);
  const scaleRef = useRef(1);
  const [transformScale, setTransformScale] = useState(1);
  const [draggingTableId, setDraggingTableId] = useState(null);
  const [draggingDecorationId, setDraggingDecorationId] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const [rndKeyVersion, setRndKeyVersion] = useState(0);
  const rndRefs = useRef(new Map());
  const groupDragStartRef = useRef(null);
  const selectionResizeRef = useRef(null);
  const decorationDragStartRef = useRef(null);
  const marqueeRef = useRef(null);
  const suppressSurfaceClickRef = useRef(false);
  const editingViewInitializedRef = useRef(false);
  const selectedTableIdSet = useMemo(
    () => new Set(selectedTableIds.length ? selectedTableIds : [selectedTableId].filter(Boolean)),
    [selectedTableId, selectedTableIds],
  );
  const {
    fitScale,
    width,
    height,
    actualSizeScale,
    viewportSize,
  } = useCanvasScale(viewportRef, canvas, editing);
  const maxScale = Math.max(
    4,
    Math.min(8, actualSizeScale),
  );
  const gridStyle = useMemo(() => {
    if (!editing || !canvas.gridEnabled) {
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
  }, [canvas.gridEnabled, canvas.gridSize, editing, fitScale]);
  const contentBounds = useMemo(() => {
    const items = [
      ...fitTables.map((table) => table.layout),
      ...decorations,
    ];
    if (items.length === 0) {
      return { left: 0, top: 0, right: 1, bottom: 1 };
    }
    const raw = items.reduce((bounds, item) => ({
      left: Math.min(bounds.left, item.xRatio),
      top: Math.min(bounds.top, item.yRatio),
      right: Math.max(bounds.right, item.xRatio + item.widthRatio),
      bottom: Math.max(bounds.bottom, item.yRatio + item.heightRatio),
    }), { left: 1, top: 1, right: 0, bottom: 0 });
    const horizontalPadding = Math.max(0.035, (raw.right - raw.left) * 0.1);
    const verticalPadding = Math.max(0.045, (raw.bottom - raw.top) * 0.12);
    return {
      left: Math.max(0, raw.left - horizontalPadding),
      top: Math.max(0, raw.top - verticalPadding),
      right: Math.min(1, raw.right + horizontalPadding),
      bottom: Math.min(1, raw.bottom + verticalPadding),
    };
  }, [decorations, fitTables]);
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
    if (transformSettleTimerRef.current) {
      clearTimeout(transformSettleTimerRef.current);
    }
    rndRefs.current.clear();
  }, []);

  useEffect(() => {
    if (!editing) {
      editingViewInitializedRef.current = false;
      setSelectionBox(null);
    }
  }, [editing]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const marquee = marqueeRef.current;
      if (!marquee) return;
      const currentX = Math.min(1, Math.max(0, (event.clientX - marquee.bounds.left) / marquee.bounds.width));
      const currentY = Math.min(1, Math.max(0, (event.clientY - marquee.bounds.top) / marquee.bounds.height));
      if (Math.abs(currentX - marquee.startX) > 0.003 || Math.abs(currentY - marquee.startY) > 0.003) {
        suppressSurfaceClickRef.current = true;
      }
      setSelectionBox({
        startX: marquee.startX,
        startY: marquee.startY,
        currentX,
        currentY,
      });
    };
    const handleMouseUp = (event) => {
      const marquee = marqueeRef.current;
      if (!marquee) return;
      const currentX = Math.min(1, Math.max(0, (event.clientX - marquee.bounds.left) / marquee.bounds.width));
      const currentY = Math.min(1, Math.max(0, (event.clientY - marquee.bounds.top) / marquee.bounds.height));
      const left = Math.min(marquee.startX, currentX);
      const right = Math.max(marquee.startX, currentX);
      const top = Math.min(marquee.startY, currentY);
      const bottom = Math.max(marquee.startY, currentY);
      const dragged = right - left > 0.003 || bottom - top > 0.003;
      if (dragged) {
        const ids = tables.filter((table) => (
          table.layout.xRatio < right
          && table.layout.xRatio + table.layout.widthRatio > left
          && table.layout.yRatio < bottom
          && table.layout.yRatio + table.layout.heightRatio > top
        )).map((table) => table.tableId);
        onSelectTables?.(ids);
        onSelectDecoration?.(null);
        suppressSurfaceClickRef.current = true;
      }
      marqueeRef.current = null;
      setSelectionBox(null);
    };
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [onSelectDecoration, onSelectTables, tables]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!editing || !surface) return undefined;
    const handleMouseDown = (event) => {
      if (event.button !== 0 || event.target !== surface) return;
      const bounds = surface.getBoundingClientRect();
      const startX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      const startY = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
      marqueeRef.current = { startX, startY, bounds };
      suppressSurfaceClickRef.current = false;
      setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
      event.preventDefault();
      event.stopPropagation();
    };
    surface.addEventListener('mousedown', handleMouseDown, true);
    return () => surface.removeEventListener('mousedown', handleMouseDown, true);
  }, [editing, height, width]);

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

  // 只有真正产生位移/尺寸变化时才更新 ratio，避免纯点击因取整导致漂移。
  const hasMoved = (nextX, nextY, currentX, currentY) => (
    Math.abs(nextX - currentX) > 0.00001
    || Math.abs(nextY - currentY) > 0.00001
  );
  const hasResized = (nextW, nextH, currentW, currentH) => (
    Math.abs(nextW - currentW) > 0.00001
    || Math.abs(nextH - currentH) > 0.00001
  );

  const refreshRndOffset = (id) => {
    const rnd = rndRefs.current.get(id);
    if (rnd && typeof rnd.updateOffsetFromParent === 'function') {
      rnd.updateOffsetFromParent();
    }
  };

  const refreshAllRndOffsets = () => {
    rndRefs.current.forEach((rnd) => {
      if (rnd && typeof rnd.updateOffsetFromParent === 'function') {
        rnd.updateOffsetFromParent();
        if (typeof rnd.forceUpdate === 'function') {
          rnd.forceUpdate();
        }
      }
    });
  };

  // Programmatic centerView/setTransform animations do not reliably emit the
  // user-interaction stop callbacks. Refresh react-rnd after every transform
  // sequence settles so it never starts the next drag with stale geometry.
  const scheduleRndOffsetRefresh = () => {
    if (transformSettleTimerRef.current) {
      clearTimeout(transformSettleTimerRef.current);
    }
    transformSettleTimerRef.current = setTimeout(() => {
      transformSettleTimerRef.current = null;
      setRndKeyVersion((version) => version + 1);
      requestAnimationFrame(refreshAllRndOffsets);
    }, 80);
  };

  const fitOperationalView = (forcedScale = null) => {
    const api = transformApiRef.current;
    if (!api || !width || !height || !viewportSize.width || !viewportSize.height) return;
    if (editing) {
      const editingScale = forcedScale ?? Math.min(
        1,
        viewportSize.width / width,
        viewportSize.height / height,
      );
      api.centerView(editingScale, 0);
      return;
    }
    if (forcedScale) {
      api.centerView(forcedScale, 220, 'easeOut');
      return;
    }
    const boundsWidth = Math.max(0.05, contentBounds.right - contentBounds.left);
    const boundsHeight = Math.max(0.05, contentBounds.bottom - contentBounds.top);
    const scale = Math.min(
      maxScale,
      Math.max(1, Math.min(
        (viewportSize.width * 0.9) / (width * boundsWidth),
        (viewportSize.height * 0.88) / (height * boundsHeight),
      )),
    );
    const centerX = (contentBounds.left + contentBounds.right) / 2;
    const centerY = (contentBounds.top + contentBounds.bottom) / 2;
    api.setTransform(
      viewportSize.width / 2 - centerX * width * scale,
      viewportSize.height / 2 - centerY * height * scale,
      scale,
      260,
      'easeOut',
    );
  };

  useEffect(() => {
    if (editing && editingViewInitializedRef.current) return undefined;
    if (editing) editingViewInitializedRef.current = true;
    const frame = requestAnimationFrame(() => fitOperationalView());
    return () => cancelAnimationFrame(frame);
  }, [
    contentBounds.bottom,
    contentBounds.left,
    contentBounds.right,
    contentBounds.top,
    editing,
    height,
    viewportSize.height,
    viewportSize.width,
    width,
  ]);

  return (
    <div
      ref={viewportRef}
      className={`floor-viewport relative h-full min-h-0 w-full touch-none overflow-hidden ${immersive
        ? 'rounded-none border-0 shadow-none'
        : 'rounded-[1.5rem] border border-stone-200 shadow-inner'}`}
      style={immersive ? {
        backgroundColor: canvas.backgroundColor,
        backgroundImage: [
          'linear-gradient(90deg, rgb(120 113 108 / 0.025) 1px, transparent 1px)',
          'linear-gradient(rgb(120 113 108 / 0.025) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '54px 54px',
      } : undefined}
      aria-label="门店桌台布局画布"
    >
      <TransformWrapper
        minScale={0.5}
        maxScale={maxScale}
        initialScale={1}
        centerOnInit={false}
        centerZoomedOut={false}
        limitToBounds={false}
        disablePadding
        autoAlignment={{ disabled: true, sizeX: 0, sizeY: 0 }}
        velocityAnimation={{ disabled: true }}
        doubleClick={{ disabled: true }}
        panning={{
          disabled: !editing,
          velocityDisabled: true,
          allowLeftClickPan: false,
          allowMiddleClickPan: true,
          allowRightClickPan: false,
          excluded: [
            'table-node',
            'canvas-control',
            'potx-table-node',
            'potx-decoration-node',
          ],
        }}
        pinch={{
          allowPanning: editing,
          excluded: ['table-node', 'canvas-control', 'potx-decoration-node'],
        }}
        // smooth 模式下缩放步长 = step × |deltaY|。Windows 滚轮一格 deltaY≈100，
        // step 必须足够小，否则一格滚轮直接顶到 maxScale。
        wheel={{ step: 0.0015, excluded: ['canvas-control'] }}
        onInit={(ref) => {
          transformApiRef.current = ref;
          scaleRef.current = ref.state.scale;
          setTransformScale(ref.state.scale);
          fitOperationalView();
          // centerOnInit 会在当前回调之后才真正完成居中，
          // 导致 Rnd 在挂载时计算的 offsetFromParent 过时。
          // 等一帧后强制 Rnd 重新挂载，重新计算 offset。
          requestAnimationFrame(() => {
            setRndKeyVersion((v) => v + 1);
            refreshAllRndOffsets();
          });
        }}
        onTransformed={(_, state) => {
          scheduleRndOffsetRefresh();
          if (Math.abs(scaleRef.current - state.scale) >= 0.0001) {
            scaleRef.current = state.scale;
            queueScaleDisplayUpdate(state.scale);
          }
        }}
        onZoomStop={(ref) => {
          scaleRef.current = ref.state.scale;
          setTransformScale(ref.state.scale);
          requestAnimationFrame(refreshAllRndOffsets);
        }}
        onPanningStop={() => {
          requestAnimationFrame(refreshAllRndOffsets);
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
                ref={surfaceRef}
                className={`floor-surface relative ${immersive ? 'rounded-none border-0' : 'rounded-[1.35rem]'} ${editing ? 'overflow-visible' : 'overflow-hidden'}`}
                style={{
                  width,
                  height,
                  ...(editing ? {
                    backgroundColor: canvas.backgroundColor,
                    ...gridStyle,
                  } : {}),
                }}
                onDoubleClick={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if (editing) {
                    const nextScale = Math.abs(scaleRef.current - 1) < 0.05
                      ? actualSizeScale
                      : 1;
                    centerView(nextScale, 240, 'easeOut');
                  }
                }}
                onClick={(event) => {
                  if (editing && event.target === event.currentTarget) {
                    if (suppressSurfaceClickRef.current) {
                      suppressSurfaceClickRef.current = false;
                      return;
                    }
                    onSelectTables?.([]);
                    onSelectTable?.(null);
                    onSelectDecoration?.(null);
                  }
                }}
                onContextMenu={(event) => {
                  if (!onCanvasContextMenu || event.target !== event.currentTarget) {
                    return;
                  }
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onCanvasContextMenu({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    xRatio: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
                    yRatio: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
                  });
                }}
              >
                {selectionBox ? (
                  <div
                    className="pointer-events-none absolute z-[50000] border-2 border-sky-500 bg-sky-300/20"
                    style={{
                      left: `${Math.min(selectionBox.startX, selectionBox.currentX) * 100}%`,
                      top: `${Math.min(selectionBox.startY, selectionBox.currentY) * 100}%`,
                      width: `${Math.abs(selectionBox.currentX - selectionBox.startX) * 100}%`,
                      height: `${Math.abs(selectionBox.currentY - selectionBox.startY) * 100}%`,
                    }}
                  />
                ) : null}
                {decorations.map((item) => {
                  const content = (
                    <div
                      className={[
                        'flex h-full w-full select-none items-center justify-center text-center font-black',
                        item.type === 'wall' ? 'rounded-full bg-stone-600/80' : '',
                        item.type === 'entrance' ? 'rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50/80 text-emerald-800' : '',
                        item.type === 'cashier' ? 'rounded-xl border border-amber-400 bg-amber-100/80 text-amber-950 shadow-sm' : '',
                        item.type === 'area' ? 'rounded-3xl border border-dashed border-sky-300 bg-sky-100/20 text-sky-700/80' : '',
                        item.type === 'seat' ? 'rounded-[42%] border-2 border-slate-300 bg-white/70 shadow-[0_5px_12px_-8px_rgba(15,23,42,.45)]' : '',
                        selectedDecorationId === item.id ? 'ring-4 ring-sky-500 ring-offset-2' : '',
                      ].join(' ')}
                      style={{
                        fontSize: 'clamp(10px, 1vw, 15px)',
                        transform: `rotate(${item.rotation ?? 0}deg)`,
                      }}
                    >
                      {['wall', 'seat'].includes(item.type) ? null : item.label}
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
                      key={`${item.id}:${width}:${height}:${rndKeyVersion}`}
                      ref={(instance) => {
                        if (instance) {
                          rndRefs.current.set(item.id, instance);
                        } else {
                          rndRefs.current.delete(item.id);
                        }
                      }}
                      className="potx-decoration-node"
                      position={{
                        x: Math.round(item.xRatio * width),
                        y: Math.round(item.yRatio * height),
                      }}
                      size={{
                        width: Math.round(item.widthRatio * width),
                        height: Math.round(item.heightRatio * height),
                      }}
                      scale={scaleRef.current}
                      dragGrid={[gridStep, gridStep]}
                      resizeGrid={[gridStep, gridStep]}
                      minWidth={item.type === 'wall' ? 30 : item.type === 'seat' ? 36 : 70}
                      minHeight={item.type === 'wall' ? 8 : item.type === 'seat' ? 32 : 35}
                      style={{ zIndex: item.zIndex + (draggingDecorationId === item.id ? 10000 : 0) }}
                      onMouseDown={() => {
                        onSelectDecoration?.(item.id);
                      }}
                      onDragStart={(event) => {
                        const point = getClientPoint(event);
                        decorationDragStartRef.current = {
                          id: item.id,
                          clientX: point.x,
                          clientY: point.y,
                        };
                        setDraggingDecorationId(item.id);
                      }}
                      onDragStop={(event) => {
                        setDraggingDecorationId(null);
                        const dragStart = decorationDragStartRef.current;
                        decorationDragStartRef.current = null;
                        const point = getClientPoint(event);
                        const deltaXPixels = dragStart?.id === item.id
                          ? point.x - dragStart.clientX
                          : 0;
                        const deltaYPixels = dragStart?.id === item.id
                          ? point.y - dragStart.clientY
                          : 0;
                        if (Math.hypot(deltaXPixels, deltaYPixels) < 3) {
                          rndRefs.current.get(item.id)?.updatePosition({
                            x: Math.round(item.xRatio * width),
                            y: Math.round(item.yRatio * height),
                          });
                          return;
                        }
                        const deltaX = deltaXPixels / (width * scaleRef.current);
                        const deltaY = deltaYPixels / (height * scaleRef.current);
                        const nextX = item.xRatio + deltaX;
                        const nextY = item.yRatio + deltaY;
                        if (hasMoved(nextX, nextY, item.xRatio, item.yRatio)) {
                          onUpdateDecoration?.(item.id, {
                            xRatio: nextX,
                            yRatio: nextY,
                          });
                        }
                      }}
                      onResizeStop={(_, __, element, ___, position) => {
                        const nextX = position.x / width;
                        const nextY = position.y / height;
                        const nextW = element.offsetWidth / width;
                        const nextH = element.offsetHeight / height;
                        if (
                          hasMoved(nextX, nextY, item.xRatio, item.yRatio)
                          || hasResized(nextW, nextH, item.widthRatio, item.heightRatio)
                        ) {
                          onUpdateDecoration?.(item.id, {
                            xRatio: nextX,
                            yRatio: nextY,
                            widthRatio: nextW,
                            heightRatio: nextH,
                          });
                        }
                      }}
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
                        onTableContextMenu={onTableContextMenu}
                        selected={selectedTableIdSet.has(table.tableId)}
                      />
                    );
                  }

                  const gridStep = canvas.snapToGrid
                    ? Math.max(1, canvas.gridSize * fitScale)
                    : 1;
                  const position = {
                    x: Math.round(table.layout.xRatio * width),
                    y: Math.round(table.layout.yRatio * height),
                  };
                  const size = {
                    width: Math.round(table.layout.widthRatio * width),
                    height: Math.round(table.layout.heightRatio * height),
                  };
                  const resizeEntries = syncSelectedResize
                    && selectedTableIdSet.size > 1
                    && selectedTableIdSet.has(table.tableId)
                    ? tables
                      .filter((item) => selectedTableIdSet.has(item.tableId))
                      .map((item) => ({
                        tableId: item.tableId,
                        layout: { ...item.layout },
                      }))
                    : [];
                  const synchronizedMinWidth = resizeEntries.length > 1
                    ? Math.max(...resizeEntries.map(({ layout }) => (
                      canvas.minTableWidth * fitScale
                      * table.layout.widthRatio / layout.widthRatio
                    )))
                    : canvas.minTableWidth * fitScale;
                  const synchronizedMinHeight = resizeEntries.length > 1
                    ? Math.max(...resizeEntries.map(({ layout }) => (
                      canvas.minTableHeight * fitScale
                      * table.layout.heightRatio / layout.heightRatio
                    )))
                    : canvas.minTableHeight * fitScale;
                  const synchronizedMaxWidth = resizeEntries.length > 1
                    ? Math.min(...resizeEntries.map(({ layout }) => (
                      canvas.maxTableWidth * fitScale
                      * table.layout.widthRatio / layout.widthRatio
                    )))
                    : canvas.maxTableWidth * fitScale;
                  const synchronizedMaxHeight = resizeEntries.length > 1
                    ? Math.min(...resizeEntries.map(({ layout }) => (
                      canvas.maxTableHeight * fitScale
                      * table.layout.heightRatio / layout.heightRatio
                    )))
                    : canvas.maxTableHeight * fitScale;

                  return (
                    <Rnd
                      key={`${table.tableId}:${width}:${height}:${rndKeyVersion}`}
                      ref={(instance) => {
                        if (instance) {
                          rndRefs.current.set(table.tableId, instance);
                        } else {
                          rndRefs.current.delete(table.tableId);
                        }
                      }}
                      className="potx-table-node"
                      position={position}
                      size={size}
                      scale={scaleRef.current}
                      dragGrid={[gridStep, gridStep]}
                      resizeGrid={[gridStep, gridStep]}
                      minWidth={Math.round(synchronizedMinWidth)}
                      minHeight={Math.round(synchronizedMinHeight)}
                      maxWidth={Math.round(synchronizedMaxWidth)}
                      maxHeight={Math.round(synchronizedMaxHeight)}
                      lockAspectRatio={
                        ['round', 'square'].includes(table.shape) ? 1 : false
                      }
                      style={{ zIndex: table.layout.zIndex + (draggingTableId === table.tableId ? 10000 : 0) }}
                      onMouseDown={(event) => {
                        if (event.button !== 0) return;
                        if (event.shiftKey || event.ctrlKey || event.metaKey) {
                          const nextIds = selectedTableIdSet.has(table.tableId)
                            ? [...selectedTableIdSet].filter((id) => id !== table.tableId)
                            : [...selectedTableIdSet, table.tableId];
                          onSelectTables?.(nextIds);
                        } else if (!selectedTableIdSet.has(table.tableId)) {
                          onSelectTables?.([table.tableId]);
                          onSelectTable?.(table.tableId);
                        }
                      }}
                      onDragStart={(event) => {
                        const point = getClientPoint(event);
                        setDraggingTableId(table.tableId);
                        const ids = selectedTableIdSet.has(table.tableId)
                          ? [...selectedTableIdSet]
                          : [table.tableId];
                        groupDragStartRef.current = {
                          activeId: table.tableId,
                          clientX: point.x,
                          clientY: point.y,
                          positions: new Map(ids.map((id) => {
                            const entry = tables.find((item) => item.tableId === id);
                            return [id, {
                              x: Math.round(entry.layout.xRatio * width),
                              y: Math.round(entry.layout.yRatio * height),
                            }];
                          })),
                        };
                      }}
                      onDrag={(event) => {
                        const group = groupDragStartRef.current;
                        if (!group || group.activeId !== table.tableId || group.positions.size < 2) return;
                        const point = getClientPoint(event);
                        const deltaX = (point.x - group.clientX) / scaleRef.current;
                        const deltaY = (point.y - group.clientY) / scaleRef.current;
                        group.positions.forEach((start, id) => {
                          if (id === table.tableId) return;
                          rndRefs.current.get(id)?.updatePosition({
                            x: start.x + deltaX,
                            y: start.y + deltaY,
                          });
                        });
                      }}
                      onDragStop={(event) => {
                        setDraggingTableId(null);
                        const dragStart = groupDragStartRef.current;
                        const point = getClientPoint(event);
                        const deltaXPixels = dragStart?.activeId === table.tableId
                          ? point.x - dragStart.clientX
                          : 0;
                        const deltaYPixels = dragStart?.activeId === table.tableId
                          ? point.y - dragStart.clientY
                          : 0;
                        groupDragStartRef.current = null;
                        if (Math.hypot(deltaXPixels, deltaYPixels) >= 3) {
                          const deltaX = deltaXPixels / (width * scaleRef.current);
                          const deltaY = deltaYPixels / (height * scaleRef.current);
                          onMoveSelectedTables?.(table.tableId, deltaX, deltaY);
                        } else {
                          dragStart?.positions.forEach((start, id) => {
                            rndRefs.current.get(id)?.updatePosition(start);
                          });
                          // 纯点击：强制恢复原位置，只把 zIndex 提到最前。
                          onUpdateTableLayout?.(table.tableId, {
                            ...table.layout,
                            bringToFront: true,
                          });
                        }
                      }}
                      onResizeStart={(_, direction) => {
                        if (resizeEntries.length > 1) {
                          selectionResizeRef.current = {
                            activeId: table.tableId,
                            direction,
                            entries: resizeEntries,
                          };
                          return;
                        }
                        selectionResizeRef.current = null;
                        onSelectTables?.([table.tableId]);
                        onSelectTable?.(table.tableId);
                      }}
                      onResize={(_, direction, element) => {
                        const group = selectionResizeRef.current;
                        if (!group || group.activeId !== table.tableId) return;
                        const scaleX = element.offsetWidth
                          / (table.layout.widthRatio * width);
                        const scaleY = element.offsetHeight
                          / (table.layout.heightRatio * height);
                        const preview = scaleTableSelection(
                          group.entries,
                          table.tableId,
                          direction,
                          scaleX,
                          scaleY,
                        );
                        preview.forEach(({ tableId, layout }) => {
                          if (tableId === table.tableId) return;
                          const instance = rndRefs.current.get(tableId);
                          instance?.updatePosition({
                            x: Math.round(layout.xRatio * width),
                            y: Math.round(layout.yRatio * height),
                          });
                          instance?.updateSize({
                            width: Math.round(layout.widthRatio * width),
                            height: Math.round(layout.heightRatio * height),
                          });
                        });
                      }}
                      onResizeStop={(_, direction, element, ___, nextPosition) => {
                        const group = selectionResizeRef.current;
                        selectionResizeRef.current = null;
                        if (group && group.activeId === table.tableId) {
                          const scaleX = element.offsetWidth
                            / (table.layout.widthRatio * width);
                          const scaleY = element.offsetHeight
                            / (table.layout.heightRatio * height);
                          onResizeSelectedTables?.(
                            table.tableId,
                            scaleTableSelection(
                              group.entries,
                              table.tableId,
                              direction,
                              scaleX,
                              scaleY,
                            ),
                          );
                          return;
                        }
                        const nextX = nextPosition.x / width;
                        const nextY = nextPosition.y / height;
                        const nextW = element.offsetWidth / width;
                        const nextH = element.offsetHeight / height;
                        if (
                          hasMoved(nextX, nextY, table.layout.xRatio, table.layout.yRatio)
                          || hasResized(nextW, nextH, table.layout.widthRatio, table.layout.heightRatio)
                        ) {
                          onUpdateTableLayout?.(table.tableId, {
                            ...table.layout,
                            xRatio: nextX,
                            yRatio: nextY,
                            widthRatio: nextW,
                            heightRatio: nextH,
                            bringToFront: true,
                          });
                        }
                      }}
                    >
                      <TableNode
                        {...table}
                        embedded
                        selected={selectedTableIdSet.has(table.tableId)}
                        timezone={timezone}
                        onTableClick={() => {
                          if (!selectedTableIdSet.has(table.tableId)) {
                            onSelectTables?.([table.tableId]);
                            onSelectTable?.(table.tableId);
                          }
                        }}
                        onTableContextMenu={onTableContextMenu}
                      />
                    </Rnd>
                  );
                })}
              </div>
            </TransformComponent>
            <ZoomControls
              zoomIn={zoomIn}
              zoomOut={zoomOut}
              fitView={fitOperationalView}
              fitScale={fitScale}
              actualSizeScale={actualSizeScale}
              transformScale={transformScale}
              editing={editing}
            />
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
