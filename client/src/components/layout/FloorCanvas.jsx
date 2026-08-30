import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  applyNodeChanges,
  ReactFlow,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Maximize2,
  Minus,
  Plus,
  ScanLine,
} from 'lucide-react';
import {
  fitViewportToBounds,
  getWorldContentBounds,
  viewportToWorldBounds,
} from '../../utils/layoutCoordinates.js';
import { isImmersiveViewportReady } from '../../utils/canvasInteraction.js';
import { scaleTableSelection } from '../../utils/layoutEditor.js';
import {
  FlowCanvasSurfaceNode,
  FlowDecorationNode,
  FlowGroupNode,
  FlowTableNode,
} from './ReactFlowNodes.jsx';

const EMPTY_EDGES = Object.freeze([]);
const INITIAL_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1 });
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const CANVAS_NODE_ID = '__potx_canvas__';
const DECORATION_PREFIX = 'decoration:';

const NODE_TYPES = Object.freeze({
  table: FlowTableNode,
  wall: FlowDecorationNode,
  entrance: FlowDecorationNode,
  cashier: FlowDecorationNode,
  area: FlowDecorationNode,
  seat: FlowDecorationNode,
  canvas: FlowCanvasSurfaceNode,
  group: FlowGroupNode,
});

function decorationNodeId(id) {
  return `${DECORATION_PREFIX}${id}`;
}

function decorationIdFromNode(id) {
  return id.startsWith(DECORATION_PREFIX)
    ? id.slice(DECORATION_PREFIX.length)
    : null;
}

function resizeDirectionLabel(direction = []) {
  return [
    direction[1] < 0 ? 'top' : direction[1] > 0 ? 'bottom' : '',
    direction[0] < 0 ? 'left' : direction[0] > 0 ? 'right' : '',
  ].join('');
}

function hasGeometryChanged(left, right) {
  return ['x', 'y', 'width', 'height'].some((key) => (
    Math.abs((left[key] ?? 0) - (right[key] ?? 0)) > 0.000001
  ));
}

function getDecorationMinimums(type) {
  if (type === 'wall') return { minWidth: 30, minHeight: 8 };
  if (type === 'seat') return { minWidth: 36, minHeight: 32 };
  return { minWidth: 70, minHeight: 35 };
}

function ZoomControls({
  viewport,
  editing,
  immersive,
  onZoom,
  onFit,
  onActualSize,
}) {
  return (
    <div
      className="canvas-control absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-soft backdrop-blur"
      data-canvas-control
    >
      <button
        type="button"
        onClick={() => onZoom(viewport.zoom / 1.2)}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        aria-label="缩小画布"
      >
        <Minus size={17} />
      </button>
      <span className="min-w-14 text-center font-mono text-xs font-bold tabular-nums text-ink-900">
        {Math.round(viewport.zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onZoom(viewport.zoom * 1.2)}
        className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
        aria-label="放大画布"
      >
        <Plus size={17} />
      </button>
      <span className="mx-0.5 h-6 w-px bg-stone-200" />
      <button
        type="button"
        onClick={onFit}
        className="canvas-control inline-flex items-center gap-1 rounded-xl px-2 py-2 text-stone-600 transition hover:bg-stone-100"
        title="回到门店全景"
        aria-label="回到门店全景"
      >
        <Maximize2 size={17} />
        {immersive ? <span className="text-xs font-bold">门店全景</span> : null}
      </button>
      {editing ? (
        <button
          type="button"
          onClick={onActualSize}
          className="canvas-control rounded-xl p-2 text-stone-600 transition hover:bg-stone-100"
          title="世界坐标 100%"
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
  onTableDoubleClick,
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
  viewportLocked = false,
  selectedDecorationId = null,
  onSelectDecoration,
  onUpdateDecoration,
  multiSelectMode = false,
  viewport = INITIAL_VIEWPORT,
  viewportInitialized = false,
  onViewportChange,
  onInitializeViewport,
  onVisibleWorldBoundsChange,
}) {
  const rootRef = useRef(null);
  const reactFlowRef = useRef(null);
  const previousImmersiveRef = useRef(immersive);
  const immersiveFitPendingRef = useRef(false);
  const interactionRef = useRef(null);
  const dragStartRef = useRef(null);
  const resizeRef = useRef(null);
  const marqueeSelectionRef = useRef([]);
  const [flowReady, setFlowReady] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [flowNodes, setFlowNodes] = useState([]);
  const selectedTableIdSet = useMemo(
    () => new Set(selectedTableIds.length
      ? selectedTableIds
      : [selectedTableId].filter(Boolean)),
    [selectedTableId, selectedTableIds],
  );
  const tableById = useMemo(
    () => new Map(tables.map((table) => [table.tableId, table])),
    [tables],
  );
  const decorationById = useMemo(
    () => new Map(decorations.map((item) => [item.id, item])),
    [decorations],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      setViewportSize((current) => (
        current.width === bounds.width && current.height === bounds.height
          ? current
          : { width: bounds.width, height: bounds.height }
      ));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const contentBounds = useMemo(() => getWorldContentBounds([
    ...fitTables.map((table) => table.layout),
    ...decorations,
  ], canvas), [canvas, decorations, fitTables]);

  const applyBoundsViewport = useCallback((bounds, initialize = false) => {
    if (!viewportSize.width || !viewportSize.height) return;
    const nextViewport = fitViewportToBounds(bounds, viewportSize, {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      padding: immersive ? 24 : 32,
    });
    if (initialize) {
      onInitializeViewport?.(nextViewport);
    } else {
      onViewportChange?.(nextViewport);
    }
  }, [immersive, onInitializeViewport, onViewportChange, viewportSize]);

  const fitStoreOverview = useCallback(() => {
    applyBoundsViewport(contentBounds);
  }, [applyBoundsViewport, contentBounds]);

  useEffect(() => {
    if (!flowReady || viewportInitialized
      || !viewportSize.width || !viewportSize.height) return;
    applyBoundsViewport(contentBounds, true);
  }, [
    applyBoundsViewport,
    contentBounds,
    flowReady,
    viewportInitialized,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    const enteringImmersive = immersive && !previousImmersiveRef.current;
    previousImmersiveRef.current = immersive;
    if (enteringImmersive) immersiveFitPendingRef.current = true;
    if (!immersive) {
      immersiveFitPendingRef.current = false;
      return;
    }
    if (!immersiveFitPendingRef.current || editing || !viewportInitialized) return;

    // Keep the pending fit until the fixed/fullscreen container has actually
    // reached the browser viewport. On large displays the first effect can run
    // while the canvas still reports its smaller dashboard size.
    const rootBounds = rootRef.current?.getBoundingClientRect();
    const documentElement = rootRef.current?.ownerDocument?.documentElement;
    if (!isImmersiveViewportReady(rootBounds, {
      width: documentElement?.clientWidth,
      height: documentElement?.clientHeight,
    })) return;
    immersiveFitPendingRef.current = false;
    fitStoreOverview();
  }, [
    editing,
    fitStoreOverview,
    immersive,
    viewportInitialized,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!viewportSize.width || !viewportSize.height) return;
    onVisibleWorldBoundsChange?.(
      viewportToWorldBounds(viewport, viewportSize, canvas),
    );
  }, [canvas, onVisibleWorldBoundsChange, viewport, viewportSize]);

  const handleTableActivate = useCallback((tableId, event) => {
    if (!editing) {
      onTableClick?.(tableId, event);
      return;
    }
    const additive = multiSelectMode
      || event?.shiftKey
      || event?.ctrlKey
      || event?.metaKey;
    if (additive) {
      const nextIds = selectedTableIdSet.has(tableId)
        ? [...selectedTableIdSet].filter((id) => id !== tableId)
        : [...selectedTableIdSet, tableId];
      onSelectTables?.(nextIds);
    } else {
      onSelectTables?.([tableId]);
      onSelectTable?.(tableId);
    }
    onSelectDecoration?.(null);
  }, [
    editing,
    multiSelectMode,
    onSelectDecoration,
    onSelectTable,
    onSelectTables,
    onTableClick,
    selectedTableIdSet,
  ]);

  const handleTableDoubleActivate = useCallback((tableId, event) => {
    if (editing) return;
    onTableDoubleClick?.(tableId, event);
  }, [editing, onTableDoubleClick]);

  const handleDecorationActivate = useCallback((id) => {
    if (!editing || multiSelectMode) return;
    onSelectDecoration?.(id);
    onSelectTables?.([]);
    onSelectTable?.(null);
  }, [
    editing,
    multiSelectMode,
    onSelectDecoration,
    onSelectTable,
    onSelectTables,
  ]);

  const handleResizeStart = useCallback((nodeId) => {
    interactionRef.current = 'resize';
    const decorationId = decorationIdFromNode(nodeId);
    if (decorationId) {
      const item = decorationById.get(decorationId);
      resizeRef.current = item ? {
        kind: 'decoration',
        id: decorationId,
        start: { ...item },
      } : null;
      return;
    }
    const table = tableById.get(nodeId);
    if (!table) return;
    const entries = syncSelectedResize
      && selectedTableIdSet.size > 1
      && selectedTableIdSet.has(nodeId)
      ? tables
        .filter((item) => selectedTableIdSet.has(item.tableId))
        .map((item) => ({ tableId: item.tableId, layout: { ...item.layout } }))
      : [{ tableId: nodeId, layout: { ...table.layout } }];
    resizeRef.current = {
      kind: 'table',
      id: nodeId,
      start: { ...table.layout },
      entries,
      direction: '',
    };
    if (!selectedTableIdSet.has(nodeId)) onSelectTables?.([nodeId]);
  }, [
    decorationById,
    onSelectTables,
    selectedTableIdSet,
    syncSelectedResize,
    tableById,
    tables,
  ]);

  const handleResize = useCallback((nodeId, params) => {
    const resize = resizeRef.current;
    if (!resize || resize.kind !== 'table' || resize.id !== nodeId
      || resize.entries.length < 2) return;
    resize.direction = resizeDirectionLabel(params.direction);
    const preview = scaleTableSelection(
      resize.entries,
      resize.id,
      resize.direction,
      params.width / resize.start.width,
      params.height / resize.start.height,
    );
    const previewById = new Map(preview.map((entry) => [entry.tableId, entry.layout]));
    setFlowNodes((current) => current.map((node) => {
      const layout = previewById.get(node.id);
      return layout ? {
        ...node,
        position: { x: layout.x, y: layout.y },
        width: layout.width,
        height: layout.height,
      } : node;
    }));
  }, []);

  const handleResizeEnd = useCallback((nodeId, params) => {
    const resize = resizeRef.current;
    resizeRef.current = null;
    interactionRef.current = null;
    if (!resize || resize.id !== nodeId) return;
    if (resize.kind === 'decoration') {
      const next = {
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
      };
      if (hasGeometryChanged(resize.start, next)) {
        onUpdateDecoration?.(resize.id, next);
      }
      return;
    }
    if (resize.entries.length > 1) {
      const nextLayouts = scaleTableSelection(
        resize.entries,
        resize.id,
        resize.direction,
        params.width / resize.start.width,
        params.height / resize.start.height,
      );
      onResizeSelectedTables?.(resize.id, nextLayouts);
      return;
    }
    const next = {
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
    };
    if (hasGeometryChanged(resize.start, next)) {
      onUpdateTableLayout?.(resize.id, next);
    }
  }, [onResizeSelectedTables, onUpdateDecoration, onUpdateTableLayout]);

  const groupNodes = useMemo(() => {
    const groups = new Map();
    for (const table of tables) {
      if (!table.groupId) continue;
      const current = groups.get(table.groupId) ?? {
        id: table.groupId,
        name: table.groupName,
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      };
      current.left = Math.min(current.left, table.layout.x);
      current.top = Math.min(current.top, table.layout.y);
      current.right = Math.max(current.right, table.layout.x + table.layout.width);
      current.bottom = Math.max(current.bottom, table.layout.y + table.layout.height);
      groups.set(table.groupId, current);
    }
    return [...groups.values()].map((group) => {
      const padding = 22;
      const x = Math.max(0, group.left - padding);
      const y = Math.max(0, group.top - padding);
      const right = Math.min(canvas.virtualWidth, group.right + padding);
      const bottom = Math.min(canvas.virtualHeight, group.bottom + padding);
      return {
        id: `group:${group.id}`,
        type: 'group',
        position: { x, y },
        width: right - x,
        height: bottom - y,
        zIndex: -1,
        draggable: false,
        selectable: false,
        focusable: false,
        data: { name: group.name },
      };
    });
  }, [canvas.virtualHeight, canvas.virtualWidth, tables]);

  const getTableResizeLimits = useCallback((table) => {
    const entries = syncSelectedResize
      && selectedTableIdSet.size > 1
      && selectedTableIdSet.has(table.tableId)
      ? tables.filter((item) => selectedTableIdSet.has(item.tableId))
      : [];
    if (entries.length < 2) {
      return {
        minWidth: canvas.minTableWidth,
        minHeight: canvas.minTableHeight,
        maxWidth: canvas.maxTableWidth,
        maxHeight: canvas.maxTableHeight,
      };
    }
    return {
      minWidth: Math.max(...entries.map((entry) => (
        canvas.minTableWidth * table.layout.width / entry.layout.width
      ))),
      minHeight: Math.max(...entries.map((entry) => (
        canvas.minTableHeight * table.layout.height / entry.layout.height
      ))),
      maxWidth: Math.min(...entries.map((entry) => (
        canvas.maxTableWidth * table.layout.width / entry.layout.width
      ))),
      maxHeight: Math.min(...entries.map((entry) => (
        canvas.maxTableHeight * table.layout.height / entry.layout.height
      ))),
    };
  }, [canvas, selectedTableIdSet, syncSelectedResize, tables]);

  const sourceNodes = useMemo(() => [
    {
      id: CANVAS_NODE_ID,
      type: 'canvas',
      position: { x: 0, y: 0 },
      width: canvas.virtualWidth,
      height: canvas.virtualHeight,
      zIndex: -1000,
      draggable: false,
      selectable: false,
      focusable: false,
      data: { canvas, editing },
    },
    ...groupNodes,
    ...decorations.map((item) => {
      const minimums = getDecorationMinimums(item.type);
      return {
        id: decorationNodeId(item.id),
        type: item.type,
        position: { x: item.x, y: item.y },
        width: item.width,
        height: item.height,
        zIndex: item.zIndex,
        draggable: editing,
        selectable: editing && !multiSelectMode,
        focusable: editing && !multiSelectMode,
        selected: editing && !multiSelectMode && selectedDecorationId === item.id,
        data: {
          item,
          editing,
          uiSelected: selectedDecorationId === item.id,
          ...minimums,
          maxWidth: canvas.virtualWidth,
          maxHeight: canvas.virtualHeight,
          onActivate: handleDecorationActivate,
          onResizeStart: handleResizeStart,
          onResize: handleResize,
          onResizeEnd: handleResizeEnd,
        },
      };
    }),
    ...tables.map((table) => ({
      id: table.tableId,
      type: 'table',
      position: { x: table.layout.x, y: table.layout.y },
      width: table.layout.width,
      height: table.layout.height,
      zIndex: table.layout.zIndex,
      draggable: editing,
      selectable: editing,
      focusable: true,
      selected: editing && selectedTableIdSet.has(table.tableId),
      data: {
        table,
        editing,
        uiSelected: selectedTableIdSet.has(table.tableId),
        timezone,
        ...getTableResizeLimits(table),
        onActivate: handleTableActivate,
        onDoubleActivate: handleTableDoubleActivate,
        onTableContextMenu,
        onResizeStart: handleResizeStart,
        onResize: handleResize,
        onResizeEnd: handleResizeEnd,
      },
    })),
  ], [
    canvas,
    decorations,
    editing,
    getTableResizeLimits,
    groupNodes,
    handleDecorationActivate,
    handleResize,
    handleResizeEnd,
    handleResizeStart,
    handleTableActivate,
    handleTableDoubleActivate,
    multiSelectMode,
    onTableContextMenu,
    selectedDecorationId,
    selectedTableIdSet,
    tables,
    timezone,
  ]);

  useEffect(() => {
    setFlowNodes((current) => {
      if (!current.length) return sourceNodes;
      const currentById = new Map(current.map((node) => [node.id, node]));
      const preservePreview = Boolean(interactionRef.current);
      return sourceNodes.map((source) => {
        const existing = currentById.get(source.id);
        if (!existing || !preservePreview) return source;
        return {
          ...source,
          position: existing.position,
          width: existing.width,
          height: existing.height,
          measured: existing.measured,
          dragging: existing.dragging,
          resizing: existing.resizing,
        };
      });
    });
  }, [sourceNodes]);

  const handleNodesChange = useCallback((changes) => {
    setFlowNodes((current) => applyNodeChanges(
      changes.filter((change) => (
        change.type !== 'select'
        || interactionRef.current === 'selection'
      )),
      current,
    ));
  }, []);

  // React Flow disables pointer events for nodes that are neither draggable
  // nor selectable unless a framework-level pointer handler exists. The
  // actual table action remains inside TableNode; this keeps operating-mode
  // table buttons clickable without making their nodes editable.
  const enableNodePointerEvents = useCallback(() => {}, []);

  const handleNodeDragStart = useCallback((_, node) => {
    if (!editing) return;
    interactionRef.current = 'drag';
    const decorationId = decorationIdFromNode(node.id);
    if (decorationId) {
      const item = decorationById.get(decorationId);
      dragStartRef.current = item ? {
        kind: 'decoration',
        id: decorationId,
        x: item.x,
        y: item.y,
      } : null;
      handleDecorationActivate(decorationId);
      return;
    }
    const table = tableById.get(node.id);
    dragStartRef.current = table ? {
      kind: 'table',
      id: node.id,
      x: table.layout.x,
      y: table.layout.y,
    } : null;
    if (!selectedTableIdSet.has(node.id)) onSelectTables?.([node.id]);
  }, [
    decorationById,
    editing,
    handleDecorationActivate,
    onSelectTables,
    selectedTableIdSet,
    tableById,
  ]);

  const handleNodeDragStop = useCallback((_, node) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    interactionRef.current = null;
    if (!start || start.id !== (decorationIdFromNode(node.id) ?? node.id)) return;
    const deltaX = node.position.x - start.x;
    const deltaY = node.position.y - start.y;
    if (Math.hypot(deltaX, deltaY) <= 0.000001) return;
    if (start.kind === 'decoration') {
      onUpdateDecoration?.(start.id, {
        x: node.position.x,
        y: node.position.y,
      });
    } else {
      onMoveSelectedTables?.(start.id, deltaX, deltaY);
    }
  }, [onMoveSelectedTables, onUpdateDecoration]);

  const handleSelectionChange = useCallback(({ nodes }) => {
    if (!editing || interactionRef.current !== 'selection') return;
    marqueeSelectionRef.current = nodes
      .filter((node) => node.type === 'table')
      .map((node) => node.id);
  }, [editing]);

  const handleSelectionStart = useCallback(() => {
    if (!editing || !multiSelectMode) return;
    interactionRef.current = 'selection';
    marqueeSelectionRef.current = [];
  }, [editing, multiSelectMode]);

  const handleSelectionEnd = useCallback(() => {
    if (interactionRef.current !== 'selection') return;
    interactionRef.current = null;
    onSelectTables?.(marqueeSelectionRef.current);
    onSelectDecoration?.(null);
  }, [onSelectDecoration, onSelectTables]);

  const handlePaneClick = useCallback(() => {
    if (!editing) return;
    onSelectTables?.([]);
    onSelectTable?.(null);
    onSelectDecoration?.(null);
  }, [editing, onSelectDecoration, onSelectTable, onSelectTables]);

  const handlePaneContextMenu = useCallback((event) => {
    if (!onCanvasContextMenu || !reactFlowRef.current) return;
    event.preventDefault();
    const point = reactFlowRef.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    onCanvasContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      x: point.x,
      y: point.y,
    });
  }, [onCanvasContextMenu]);

  const zoomAroundCenter = useCallback((requestedZoom) => {
    if (!viewportSize.width || !viewportSize.height) return;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requestedZoom));
    const centerX = (viewportSize.width / 2 - viewport.x) / viewport.zoom;
    const centerY = (viewportSize.height / 2 - viewport.y) / viewport.zoom;
    onViewportChange?.({
      x: viewportSize.width / 2 - centerX * nextZoom,
      y: viewportSize.height / 2 - centerY * nextZoom,
      zoom: nextZoom,
    });
  }, [onViewportChange, viewport, viewportSize]);

  const resetAbortedTouchDrag = useCallback(() => {
    requestAnimationFrame(() => {
      if (interactionRef.current !== 'drag') return;
      interactionRef.current = null;
      dragStartRef.current = null;
      setFlowNodes(sourceNodes);
    });
  }, [sourceNodes]);

  return (
    <div
      ref={rootRef}
      className={`floor-viewport relative h-full min-h-0 w-full overflow-hidden ${immersive
        ? 'floor-viewport--immersive rounded-none border-0 shadow-none'
        : 'rounded-[1.5rem] border border-stone-200 shadow-inner'}`}
      aria-label="门店桌台布局画布"
      onTouchEnd={resetAbortedTouchDrag}
      onTouchCancel={resetAbortedTouchDrag}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={EMPTY_EDGES}
        nodeTypes={NODE_TYPES}
        viewport={viewport}
        onViewportChange={onViewportChange}
        onInit={(instance) => {
          reactFlowRef.current = instance;
          setFlowReady(true);
        }}
        onNodesChange={handleNodesChange}
        onNodeClick={enableNodePointerEvents}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onSelectionStart={handleSelectionStart}
        onSelectionChange={handleSelectionChange}
        onSelectionEnd={handleSelectionEnd}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        nodesDraggable={editing}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={editing}
        selectNodesOnDrag={false}
        selectionOnDrag={editing && multiSelectMode}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={editing ? 'Shift' : null}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        // React Flow treats touch independently from mouse-button arrays.
        // Multi-select reserves one-finger drag for the marquee. The parent
        // locks one-finger panning while full-screen operations are active.
        panOnDrag={viewportLocked || (editing && multiSelectMode) ? false : true}
        zoomOnPinch
        zoomOnScroll
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling
        nodeDragThreshold={6}
        nodeClickDistance={6}
        paneClickDistance={6}
        snapToGrid={editing && canvas.snapToGrid}
        snapGrid={[canvas.gridSize, canvas.gridSize]}
        nodeExtent={[[0, 0], [canvas.virtualWidth, canvas.virtualHeight]]}
        translateExtent={[
          [-canvas.virtualWidth, -canvas.virtualHeight],
          [canvas.virtualWidth * 2, canvas.virtualHeight * 2],
        ]}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        autoPanOnNodeDrag={false}
        autoPanOnSelection={false}
        autoPanOnNodeFocus={false}
        elevateNodesOnSelect={false}
        zIndexMode="manual"
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className={immersive ? 'potx-react-flow immersive' : 'potx-react-flow'}
      />
      {editing && multiSelectMode ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-violet-300 bg-violet-100/95 px-4 py-2 text-xs font-black text-violet-950 shadow-lg backdrop-blur">
          多选模式 · 拖动空白区域框选桌台
        </div>
      ) : null}
      <ZoomControls
        viewport={viewport}
        editing={editing}
        immersive={immersive}
        onZoom={zoomAroundCenter}
        onFit={fitStoreOverview}
        onActualSize={() => zoomAroundCenter(1)}
      />
    </div>
  );
}
