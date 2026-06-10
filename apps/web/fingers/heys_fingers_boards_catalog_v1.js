// heys_fingers_boards_catalog_v1.js — Каталог fingerboard-моделей и hang blocks.
// Wave 2-A: статичный массив с реальными edge-размерами от производителей.
//
// Public API:
//   HEYS.Fingers.BOARDS               — массив досок
//   HEYS.Fingers.getBoardById(id)     — lookup
//   HEYS.Fingers.normalizeBlockBoardId(id) — legacy block id alias
//   HEYS.Fingers.getEdgeById(boardId, edgeId)
//   HEYS.Fingers.findCompatibleEdges(boardId, gripId) — список edge подходящих хвату
//
// Формат board:
//   { id, label, manufacturer, edges: [{id,label,sizeMm,gripCompat:[gripId,...]}], imageUrl }
//
// Размеры edges — из официальных описаний производителей. Округлены до целых мм.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__boardsCatalogRegistered) return; // idempotent
  Fingers.__boardsCatalogRegistered = true;

  /** @type {Array} */
  const BOARDS = [
    {
      id: 'beastmaker_1000',
      label: 'Beastmaker 1000 Series',
      manufacturer: 'Beastmaker (UK)',
      imageUrl: null,
      edges: [
        { id: 'jugs_45',           label: 'Jugs (отдых)',    sizeMm: 45, gripCompat: ['openhand4', 'halfcrimp', 'pinch'] },
        { id: 'sloper_35',         label: 'Sloper 35°',      sizeMm: 35, gripCompat: ['sloper', 'openhand4'] },
        { id: 'edge_20',           label: 'Edge 20 мм',      sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_15',           label: 'Edge 15 мм',      sizeMm: 15, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'pocket_3finger_20', label: '3-finger pocket', sizeMm: 20, gripCompat: ['front3', 'back3'] },
        { id: 'pocket_2finger_20', label: '2-finger pocket', sizeMm: 20, gripCompat: ['halfcrimp', 'openhand4'] },
        { id: 'mono_20',           label: 'Mono pocket',     sizeMm: 20, gripCompat: ['mono'] }
      ]
    },
    {
      id: 'beastmaker_2000',
      label: 'Beastmaker 2000 Pro',
      manufacturer: 'Beastmaker (UK)',
      imageUrl: null,
      edges: [
        { id: 'jugs_50',           label: 'Jugs',            sizeMm: 50, gripCompat: ['openhand4', 'halfcrimp'] },
        { id: 'sloper_20',         label: 'Sloper 20°',      sizeMm: 20, gripCompat: ['sloper'] },
        { id: 'sloper_40',         label: 'Sloper 40°',      sizeMm: 40, gripCompat: ['sloper'] },
        { id: 'edge_20',           label: 'Edge 20 мм',      sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_12',           label: 'Edge 12 мм',      sizeMm: 12, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_9',            label: 'Edge 9 мм',       sizeMm: 9,  gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'edge_6',            label: 'Edge 6 мм',       sizeMm: 6,  gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'pocket_3finger_15', label: '3-finger pocket', sizeMm: 15, gripCompat: ['front3', 'back3'] },
        { id: 'pocket_2finger_15', label: '2-finger pocket', sizeMm: 15, gripCompat: ['halfcrimp'] },
        { id: 'mono_15',           label: 'Mono pocket',     sizeMm: 15, gripCompat: ['mono'] }
      ]
    },
    {
      id: 'tension_block',
      label: 'Tension Climbing Block',
      manufacturer: 'Tension Climbing (USA)',
      imageUrl: null,
      edges: [
        { id: 'edge_25',           label: 'Edge 25 мм',      sizeMm: 25, gripCompat: ['openhand4', 'halfcrimp', 'pinch'] },
        { id: 'edge_20',           label: 'Edge 20 мм',      sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp'] },
        { id: 'edge_14',           label: 'Edge 14 мм',      sizeMm: 14, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'edge_10',           label: 'Edge 10 мм',      sizeMm: 10, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'edge_8',            label: 'Edge 8 мм',       sizeMm: 8,  gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'pinch_wide',        label: 'Pinch wide',      sizeMm: 30, gripCompat: ['pinch'] },
        { id: 'pinch_narrow',      label: 'Pinch narrow',    sizeMm: 20, gripCompat: ['pinch'] }
      ]
    },
    {
      id: 'moon_2020',
      label: 'Moon Fingerboard 2020',
      manufacturer: 'Moon Climbing (UK)',
      imageUrl: null,
      edges: [
        { id: 'jugs_40',           label: 'Jugs',            sizeMm: 40, gripCompat: ['openhand4', 'halfcrimp'] },
        { id: 'sloper_30',         label: 'Sloper 30°',      sizeMm: 30, gripCompat: ['sloper'] },
        { id: 'edge_22',           label: 'Edge 22 мм',      sizeMm: 22, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp'] },
        { id: 'edge_14',           label: 'Edge 14 мм',      sizeMm: 14, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_7',            label: 'Edge 7 мм',       sizeMm: 7,  gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'pocket_3finger_22', label: '3-finger pocket', sizeMm: 22, gripCompat: ['front3', 'back3'] },
        { id: 'pocket_2finger_22', label: '2-finger pocket', sizeMm: 22, gripCompat: ['halfcrimp'] }
      ]
    },
    {
      id: 'lattice_block',
      label: 'Lattice Tension Block',
      manufacturer: 'Lattice Training (UK)',
      imageUrl: null,
      edges: [
        { id: 'edge_20',           label: 'Edge 20 мм',      sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp'] },
        { id: 'edge_14',           label: 'Edge 14 мм',      sizeMm: 14, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'edge_10',           label: 'Edge 10 мм',      sizeMm: 10, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'pinch_25',          label: 'Pinch 25 мм',     sizeMm: 25, gripCompat: ['pinch'] }
      ]
    },
    {
      id: 'generic',
      label: 'Другая доска (ручной ввод)',
      manufacturer: 'Generic',
      imageUrl: null,
      edges: [
        { id: 'jug',               label: 'Jug',             sizeMm: 40, gripCompat: ['openhand4', 'halfcrimp', 'pinch'] },
        { id: 'edge_20',           label: 'Edge 20 мм',      sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_15',           label: 'Edge 15 мм',      sizeMm: 15, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_10',           label: 'Edge 10 мм',      sizeMm: 10, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'sloper',            label: 'Sloper',          sizeMm: 35, gripCompat: ['sloper'] },
        { id: 'pocket_3finger',    label: '3-finger pocket', sizeMm: 20, gripCompat: ['front3', 'back3'] },
        { id: 'mono',              label: 'Mono pocket',     sizeMm: 18, gripCompat: ['mono'] }
      ]
    },
    // ─── Hang blocks (portable lift/hang tools) ──────────────────────────
    // kind: 'block' маркер — UI отображает их в отдельном tab'е EquipmentBar
    // («💪 Hang block»). Используются для max-hangs и block-lifts (eccentric
    // подъём гантели/гири/диска снизу за карабин). Repeaters не подходят —
    // нет разнообразия для длительной последовательности подходов.
    {
      id: 'xclimb_terminator',
      kind: 'block',
      label: 'xclimb Terminator',
      manufacturer: 'xclimb (RU)',
      imageUrl: null,
      edges: [
        { id: 'edge_20', label: 'Edge 20 мм', sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_15', label: 'Edge 15 мм', sizeMm: 15, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_10', label: 'Edge 10 мм', sizeMm: 10, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'pocket_2finger_18', label: '2-finger pocket', sizeMm: 18, gripCompat: ['halfcrimp', 'front3'] }
      ]
    },
    {
      id: 'tension_block_1',
      kind: 'block',
      label: 'Tension Block 1.0',
      manufacturer: 'Tension Climbing (US)',
      imageUrl: null,
      edges: [
        { id: 'edge_20', label: 'Edge 20 мм', sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_15', label: 'Edge 15 мм', sizeMm: 15, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_10', label: 'Edge 10 мм', sizeMm: 10, gripCompat: ['halfcrimp', 'fullcrimp'] },
        { id: 'pocket_3finger_18', label: '3-finger pocket', sizeMm: 18, gripCompat: ['front3'] }
      ]
    },
    {
      id: 'lattice_hang_block',
      kind: 'block',
      label: 'Lattice Hang Block',
      manufacturer: 'Lattice Training (UK)',
      imageUrl: null,
      edges: [
        { id: 'edge_20', label: 'Edge 20 мм', sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_14', label: 'Edge 14 мм', sizeMm: 14, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] }
      ]
    },
    {
      id: 'custom_wood_block',
      kind: 'block',
      label: 'Самодельный block',
      manufacturer: 'Custom wood',
      imageUrl: null,
      edges: [
        { id: 'edge_20', label: 'Edge 20 мм', sizeMm: 20, gripCompat: ['openhand4', 'halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_15', label: 'Edge 15 мм', sizeMm: 15, gripCompat: ['halfcrimp', 'fullcrimp', 'front3'] },
        { id: 'edge_10', label: 'Edge 10 мм', sizeMm: 10, gripCompat: ['halfcrimp', 'fullcrimp'] }
      ]
    }
  ];

  const BOARDS_BY_ID = Object.create(null);
  BOARDS.forEach(function (b) { BOARDS_BY_ID[b.id] = b; });

  function getBoardById(id) {
    return BOARDS_BY_ID[id] || null;
  }

  function normalizeBlockBoardId(id) {
    // Compatibility: до 2026-06-10 portable Lattice Hang Block делил id с full
    // Lattice board. В block-контексте старый id должен резолвиться в block.
    if (id === 'lattice_block') return 'lattice_hang_block';
    return id;
  }

  function getEdgeById(boardId, edgeId) {
    const board = getBoardById(boardId);
    if (!board) return null;
    for (let i = 0; i < board.edges.length; i++) {
      if (board.edges[i].id === edgeId) return board.edges[i];
    }
    return null;
  }

  /**
   * Список edge на доске, на которых разумно делать данный хват.
   * @param {string} boardId
   * @param {string} gripId
   * @returns {Array}
   */
  function findCompatibleEdges(boardId, gripId) {
    const board = getBoardById(boardId);
    if (!board || !gripId) return [];
    return board.edges.filter(function (e) {
      return Array.isArray(e.gripCompat) && e.gripCompat.indexOf(gripId) >= 0;
    });
  }

  /**
   * Доски по типу: 'fingerboard' (полные настенные) или 'block' (portable
   * hang block для max-hangs и lift'ов). Default kind для legacy записей — 'fingerboard'.
   * @param {string} kind
   * @returns {Array}
   */
  function getBoardsByKind(kind) {
    return BOARDS.filter(function (b) {
      return (b.kind || 'fingerboard') === kind;
    });
  }

  // === Экспорт ===
  Fingers.BOARDS = BOARDS;
  Fingers.BOARDS_BY_ID = BOARDS_BY_ID;
  Fingers.getBoardById = getBoardById;
  Fingers.normalizeBlockBoardId = normalizeBlockBoardId;
  Fingers.getEdgeById = getEdgeById;
  Fingers.findCompatibleEdges = findCompatibleEdges;
  Fingers.getBoardsByKind = getBoardsByKind;
})(typeof window !== 'undefined' ? window : globalThis);
