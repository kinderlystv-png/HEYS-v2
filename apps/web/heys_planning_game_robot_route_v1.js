// heys_planning_game_robot_route_v1.js — lightweight logic game for Planning.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const PlanningGames = HEYS.PlanningGames = HEYS.PlanningGames || {};
  const modules = PlanningGames.modules = PlanningGames.modules || {};
  if (modules['robot-route']) return;

  const React = global.React;
  const h = React && React.createElement;
  const MAX_COMMANDS = 12;
  const DIRECTIONS = Object.freeze({
    up: Object.freeze({ row: -1, col: 0, symbol: '↑', label: 'вверх' }),
    down: Object.freeze({ row: 1, col: 0, symbol: '↓', label: 'вниз' }),
    left: Object.freeze({ row: 0, col: -1, symbol: '←', label: 'влево' }),
    right: Object.freeze({ row: 0, col: 1, symbol: '→', label: 'вправо' }),
  });
  const DIRECTION_ORDER = Object.freeze(['up', 'right', 'down', 'left']);

  function point(row, col) {
    return Object.freeze({ row: row, col: col });
  }

  function freezeLevel(level) {
    return Object.freeze({
      id: level.id,
      tier: level.tier,
      size: level.size,
      start: point(level.start[0], level.start[1]),
      goal: point(level.goal[0], level.goal[1]),
      obstacles: Object.freeze(level.obstacles.map(function (item) { return point(item[0], item[1]); })),
      expectedShortestPath: level.expectedShortestPath,
      hintFirstMove: level.hintFirstMove,
    });
  }

  const LEVELS = Object.freeze([
    freezeLevel({ id: 't1-straight', tier: 1, size: 4, start: [0, 0], goal: [0, 3], obstacles: [], expectedShortestPath: 3, hintFirstMove: 'right' }),
    freezeLevel({ id: 't1-up', tier: 1, size: 4, start: [3, 0], goal: [0, 0], obstacles: [], expectedShortestPath: 3, hintFirstMove: 'up' }),
    freezeLevel({ id: 't1-corner', tier: 1, size: 4, start: [0, 0], goal: [2, 2], obstacles: [[1, 1]], expectedShortestPath: 4, hintFirstMove: 'right' }),
    freezeLevel({ id: 't1-diagonal', tier: 1, size: 4, start: [3, 3], goal: [1, 1], obstacles: [[2, 2]], expectedShortestPath: 4, hintFirstMove: 'up' }),
    freezeLevel({ id: 't2-lower-detour', tier: 2, size: 4, start: [0, 0], goal: [0, 3], obstacles: [[0, 1]], expectedShortestPath: 5, hintFirstMove: 'down' }),
    freezeLevel({ id: 't2-right-detour', tier: 2, size: 4, start: [3, 0], goal: [0, 3], obstacles: [[2, 0], [2, 1]], expectedShortestPath: 6, hintFirstMove: 'right' }),
    freezeLevel({ id: 't2-small-arc', tier: 2, size: 5, start: [0, 0], goal: [2, 0], obstacles: [[1, 0]], expectedShortestPath: 4, hintFirstMove: 'right' }),
    freezeLevel({ id: 't2-top-arc', tier: 2, size: 5, start: [4, 4], goal: [2, 4], obstacles: [[3, 4], [3, 3]], expectedShortestPath: 6, hintFirstMove: 'left' }),
    freezeLevel({ id: 't3-gate', tier: 3, size: 5, start: [0, 0], goal: [0, 4], obstacles: [[0, 1], [1, 1]], expectedShortestPath: 8, hintFirstMove: 'down' }),
    freezeLevel({ id: 't3-zigzag', tier: 3, size: 5, start: [4, 0], goal: [0, 4], obstacles: [[3, 0], [3, 2], [2, 2]], expectedShortestPath: 8, hintFirstMove: 'right' }),
    freezeLevel({ id: 't3-opposite-corners', tier: 3, size: 5, start: [0, 4], goal: [4, 0], obstacles: [[1, 4], [1, 3], [2, 2]], expectedShortestPath: 8, hintFirstMove: 'left' }),
    freezeLevel({ id: 't3-lower-channel', tier: 3, size: 5, start: [2, 0], goal: [2, 4], obstacles: [[2, 1], [1, 1]], expectedShortestPath: 6, hintFirstMove: 'down' }),
  ]);

  function pointKey(value) {
    return value.row + ':' + value.col;
  }

  function samePoint(a, b) {
    return a.row === b.row && a.col === b.col;
  }

  function isInside(level, value) {
    return Number.isInteger(value.row)
      && Number.isInteger(value.col)
      && value.row >= 0
      && value.col >= 0
      && value.row < level.size
      && value.col < level.size;
  }

  function obstacleSet(level) {
    return new Set(level.obstacles.map(pointKey));
  }

  function normalizeCommand(command) {
    const aliases = {
      '↑': 'up', ArrowUp: 'up', w: 'up', W: 'up',
      '↓': 'down', ArrowDown: 'down', s: 'down', S: 'down',
      '←': 'left', ArrowLeft: 'left', a: 'left', A: 'left',
      '→': 'right', ArrowRight: 'right', d: 'right', D: 'right',
    };
    return DIRECTIONS[command] ? command : aliases[command] || null;
  }

  function nextPoint(position, command) {
    const direction = DIRECTIONS[command];
    return point(position.row + direction.row, position.col + direction.col);
  }

  function bfsFrom(level, origin) {
    if (!isInside(level, origin)) return null;
    const blocked = obstacleSet(level);
    if (blocked.has(pointKey(origin))) return null;
    const queue = [{ position: point(origin.row, origin.col), path: [] }];
    const visited = new Set([pointKey(origin)]);
    let cursor = 0;

    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (samePoint(current.position, level.goal)) return current.path;

      for (let index = 0; index < DIRECTION_ORDER.length; index += 1) {
        const command = DIRECTION_ORDER[index];
        const candidate = nextPoint(current.position, command);
        const key = pointKey(candidate);
        if (!isInside(level, candidate) || blocked.has(key) || visited.has(key)) continue;
        visited.add(key);
        queue.push({ position: candidate, path: current.path.concat(command) });
      }
    }
    return null;
  }

  function bfsShortestPath(level) {
    return bfsFrom(level, level.start);
  }

  function executeProgram(level, commands) {
    const supplied = Array.isArray(commands) ? commands.slice() : [];
    const normalized = supplied.map(normalizeCommand);
    const start = point(level.start.row, level.start.col);

    if (supplied.length > MAX_COMMANDS) {
      return {
        success: false,
        error: 'PROGRAM_LIMIT',
        position: start,
        lastAttemptPosition: start,
        visited: [start],
        executedCommands: [],
        commands: supplied,
      };
    }
    if (normalized.some(function (command) { return !command; })) {
      return {
        success: false,
        error: 'UNKNOWN_COMMAND',
        position: start,
        lastAttemptPosition: start,
        visited: [start],
        executedCommands: [],
        commands: supplied,
      };
    }

    const blocked = obstacleSet(level);
    const visited = [start];
    const executedCommands = [];
    let position = start;

    for (let index = 0; index < normalized.length; index += 1) {
      const command = normalized[index];
      const candidate = nextPoint(position, command);
      if (!isInside(level, candidate)) {
        return {
          success: false,
          error: 'OUT_OF_BOUNDS',
          position: start,
          lastAttemptPosition: position,
          visited: visited,
          executedCommands: executedCommands,
          commands: supplied,
        };
      }
      if (blocked.has(pointKey(candidate))) {
        return {
          success: false,
          error: 'OBSTACLE',
          position: start,
          lastAttemptPosition: position,
          visited: visited,
          executedCommands: executedCommands,
          commands: supplied,
        };
      }

      position = candidate;
      visited.push(position);
      executedCommands.push(command);
      if (samePoint(position, level.goal)) {
        return {
          success: true,
          error: null,
          position: position,
          lastAttemptPosition: position,
          visited: visited,
          executedCommands: executedCommands,
          commands: supplied,
        };
      }
    }

    return {
      success: false,
      error: 'GOAL_NOT_REACHED',
      position: start,
      lastAttemptPosition: position,
      visited: visited,
      executedCommands: executedCommands,
      commands: supplied,
    };
  }

  function isHintOnShortestPath(level) {
    const command = normalizeCommand(level.hintFirstMove);
    const shortest = bfsShortestPath(level);
    if (!command || !shortest) return false;
    const candidate = nextPoint(level.start, command);
    if (!isInside(level, candidate) || obstacleSet(level).has(pointKey(candidate))) return false;
    const remainder = bfsFrom(level, candidate);
    return Boolean(remainder && remainder.length + 1 === shortest.length);
  }

  function validateLevels() {
    const errors = [];
    const ids = new Set();
    LEVELS.forEach(function (level) {
      if (ids.has(level.id)) errors.push(level.id + ': duplicate id');
      ids.add(level.id);
      if (![1, 2, 3].includes(level.tier)) errors.push(level.id + ': invalid tier');
      if (![4, 5].includes(level.size)) errors.push(level.id + ': invalid size');
      if (!isInside(level, level.start)) errors.push(level.id + ': start outside field');
      if (!isInside(level, level.goal)) errors.push(level.id + ': goal outside field');
      if (samePoint(level.start, level.goal)) errors.push(level.id + ': start equals goal');
      const seen = new Set();
      level.obstacles.forEach(function (obstacle) {
        const key = pointKey(obstacle);
        if (!isInside(level, obstacle)) errors.push(level.id + ': obstacle outside field');
        if (seen.has(key)) errors.push(level.id + ': duplicate obstacle');
        if (samePoint(obstacle, level.start) || samePoint(obstacle, level.goal)) {
          errors.push(level.id + ': obstacle overlaps endpoint');
        }
        seen.add(key);
      });
      const shortest = bfsShortestPath(level);
      if (!shortest) errors.push(level.id + ': unreachable');
      else if (shortest.length !== level.expectedShortestPath) errors.push(level.id + ': shortest path mismatch');
      if (!isHintOnShortestPath(level)) errors.push(level.id + ': invalid hint');
    });
    return { valid: errors.length === 0, errors: errors, levelsCount: LEVELS.length };
  }

  function seededRandom(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return function () {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(items, random) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const value = result[index];
      result[index] = result[swapIndex];
      result[swapIndex] = value;
    }
    return result;
  }

  function createSession(options) {
    const seed = options && options.seed != null ? options.seed : Date.now();
    const random = seededRandom(seed);
    const byTier = function (tier) {
      return shuffled(LEVELS.filter(function (level) { return level.tier === tier; }), random);
    };
    const selected = byTier(1).slice(0, 1)
      .concat(byTier(2).slice(0, 2), byTier(3).slice(0, 2));
    return {
      seed: seed,
      levels: selected,
      currentIndex: 0,
    };
  }

  function RobotRouteGame(props) {
    if (!React || !h) return null;
    const onExit = props && typeof props.onExit === 'function' ? props.onExit : function () {};
    const reducedMotion = Boolean(props && props.reducedMotion);
    const initialSeed = props && props.seed != null ? props.seed : Date.now();
    const rootRef = React.useRef(null);
    const mountedRef = React.useRef(false);
    const timeoutRef = React.useRef(new Set());
    const replayRef = React.useRef(0);
    const [session, setSession] = React.useState(function () { return createSession({ seed: initialSeed }); });
    const [levelIndex, setLevelIndex] = React.useState(0);
    const [commands, setCommands] = React.useState([]);
    const [robotPosition, setRobotPosition] = React.useState(session.levels[0].start);
    const [attempts, setAttempts] = React.useState(0);
    const [status, setStatus] = React.useState('planning');
    const [message, setMessage] = React.useState('Добавь ходы по порядку.');

    const level = session.levels[levelIndex];
    const running = status === 'running';
    const success = status === 'success';
    const complete = status === 'complete';
    const showHint = attempts >= 2 && !success && !complete;

    function clearTimers() {
      timeoutRef.current.forEach(function (timer) { global.clearTimeout(timer); });
      timeoutRef.current.clear();
    }

    function schedule(callback, delay) {
      const timer = global.setTimeout(function () {
        timeoutRef.current.delete(timer);
        if (mountedRef.current) callback();
      }, delay);
      timeoutRef.current.add(timer);
    }

    React.useEffect(function () {
      mountedRef.current = true;
      return function () {
        mountedRef.current = false;
        clearTimers();
      };
    }, []);

    function resetLevel(nextLevel, nextStatus) {
      clearTimers();
      setCommands([]);
      setAttempts(0);
      setStatus(nextStatus || 'planning');
      setMessage('Добавь ходы по порядку.');
      setRobotPosition(nextLevel.start);
    }

    function addCommand(command) {
      if (running || success || commands.length >= MAX_COMMANDS) return;
      setCommands(function (current) { return current.length < MAX_COMMANDS ? current.concat(command) : current; });
      setMessage(commands.length + 1 >= MAX_COMMANDS ? 'Лимит — 12 ходов.' : 'Маршрут собран.');
    }

    function removeCommand() {
      if (running || success || commands.length === 0) return;
      setCommands(function (current) { return current.slice(0, -1); });
      setMessage('Последний ход удалён.');
    }

    function restartCurrent() {
      resetLevel(level);
    }

    function finishRun(result) {
      if (result.success) {
        setRobotPosition(result.position);
        setStatus('success');
        setMessage('Маршрут готов.');
        return;
      }
      setRobotPosition(level.start);
      setAttempts(function (value) { return value + 1; });
      setStatus('error');
      if (result.error === 'OBSTACLE') setMessage('На пути препятствие. Измени маршрут.');
      else if (result.error === 'OUT_OF_BOUNDS') setMessage('Этот ход ведёт за границу поля.');
      else setMessage('Робот пока не дошёл до цели.');
    }

    function runProgram() {
      if (running || success || commands.length === 0) return;
      clearTimers();
      const result = executeProgram(level, commands);
      setStatus('running');
      setMessage('Робот идёт по маршруту…');

      if (reducedMotion || result.visited.length <= 1) {
        finishRun(result);
        return;
      }

      const steps = result.visited.slice(1);
      steps.forEach(function (position, index) {
        schedule(function () { setRobotPosition(position); }, 220 * (index + 1));
      });
      schedule(function () { finishRun(result); }, 220 * (steps.length + 1));
    }

    function nextLevel() {
      if (!success) return;
      if (levelIndex >= session.levels.length - 1) {
        setStatus('complete');
        setMessage('Пять маршрутов готовы.');
        return;
      }
      const nextIndex = levelIndex + 1;
      setLevelIndex(nextIndex);
      resetLevel(session.levels[nextIndex]);
    }

    function replay() {
      replayRef.current += 1;
      const nextSession = createSession({ seed: Number(initialSeed) + replayRef.current });
      setSession(nextSession);
      setLevelIndex(0);
      resetLevel(nextSession.levels[0]);
    }

    function handleKeyDown(event) {
      const target = event.target;
      const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (target && (target.isContentEditable || ['button', 'input', 'select', 'textarea'].includes(tagName))) return;
      const command = normalizeCommand(event.key);
      if (command) {
        event.preventDefault();
        addCommand(command);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        removeCommand();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runProgram();
      }
    }

    function renderBoard() {
      const blocked = obstacleSet(level);
      const cells = [];
      for (let row = 0; row < level.size; row += 1) {
        for (let col = 0; col < level.size; col += 1) {
          const coordinate = point(row, col);
          const isObstacle = blocked.has(pointKey(coordinate));
          const isGoal = samePoint(coordinate, level.goal);
          const hasRobot = samePoint(coordinate, robotPosition);
          const classes = ['planning-robot-route__cell'];
          if (isObstacle) classes.push('planning-robot-route__cell--obstacle');
          if (isGoal) classes.push('planning-robot-route__cell--goal');
          if (hasRobot) classes.push('planning-robot-route__cell--robot');
          cells.push(h('div', {
            key: row + '-' + col,
            className: classes.join(' '),
            role: 'gridcell',
            'aria-label': hasRobot ? 'Робот' : isGoal ? 'Цель' : isObstacle ? 'Препятствие' : 'Свободная клетка',
          },
          isGoal ? h('span', { className: 'planning-robot-route__goal-mark', 'aria-hidden': 'true' }, '◆') : null,
          hasRobot ? h('span', { className: 'planning-robot-route__robot', 'aria-hidden': 'true' }, h('i'), h('i')) : null));
        }
      }
      return h('div', {
        className: 'planning-robot-route__board',
        role: 'grid',
        'aria-label': 'Игровое поле ' + level.size + ' на ' + level.size,
        style: { '--robot-grid-size': level.size },
      }, cells);
    }

    if (complete) {
      return h('section', { className: 'planning-robot-route planning-robot-route--result', 'aria-labelledby': 'robot-route-result-title' },
        h('div', { className: 'planning-robot-route__result-mark', 'aria-hidden': 'true' }, '◆'),
        h('h2', { id: 'robot-route-result-title' }, 'Все маршруты готовы'),
        h('p', null, 'Ты провёл робота по пяти полям.'),
        h('div', { className: 'planning-robot-route__result-actions' },
          h('button', { type: 'button', className: 'planning-robot-route__primary', onClick: replay }, 'Сыграть ещё'),
          h('button', { type: 'button', className: 'planning-robot-route__secondary', onClick: onExit }, 'Вернуться к играм')),
      );
    }

    return h('section', {
      ref: rootRef,
      className: 'planning-robot-route',
      tabIndex: 0,
      onKeyDown: handleKeyDown,
      'aria-labelledby': 'robot-route-title',
    },
    h('div', { className: 'planning-robot-route__topline' },
      h('div', null,
        h('p', { className: 'planning-robot-route__eyebrow' }, 'Маршрут ' + (levelIndex + 1) + ' из ' + session.levels.length),
        h('h2', { id: 'robot-route-title' }, 'Составь путь до цели')),
      h('span', { className: 'planning-robot-route__tier' }, 'Уровень ' + level.tier)),
    h('div', { className: 'planning-robot-route__layout' },
      h('div', { className: 'planning-robot-route__field-wrap' }, renderBoard(),
        h('div', { className: 'planning-robot-route__legend', 'aria-hidden': 'true' },
          h('span', null, h('i', { className: 'planning-robot-route__legend-goal' }), 'Цель'),
          h('span', null, h('i', { className: 'planning-robot-route__legend-obstacle' }), 'Препятствие'))),
      h('div', { className: 'planning-robot-route__panel' },
        h('div', { className: 'planning-robot-route__program-head' },
          h('h3', null, 'Твой маршрут'),
          h('span', null, commands.length + ' / ' + MAX_COMMANDS)),
        h('div', { className: 'planning-robot-route__program', 'aria-label': 'Команды маршрута' },
          commands.length
            ? commands.map(function (command, index) {
              return h('span', { key: index, 'aria-label': DIRECTIONS[command].label }, DIRECTIONS[command].symbol);
            })
            : h('p', null, 'Выбери первый ход')),
        h('div', { className: 'planning-robot-route__directions', 'aria-label': 'Добавить ход' },
          DIRECTION_ORDER.map(function (command) {
            return h('button', {
              key: command,
              type: 'button',
              className: 'planning-robot-route__direction' + (showHint && command === level.hintFirstMove ? ' planning-robot-route__direction--hint' : ''),
              disabled: running || success || commands.length >= MAX_COMMANDS,
              onClick: function () { addCommand(command); },
              'aria-label': 'Добавить ход ' + DIRECTIONS[command].label,
            }, DIRECTIONS[command].symbol);
          })),
        showHint ? h('p', { className: 'planning-robot-route__hint' }, 'Подсказка: начни с ' + DIRECTIONS[level.hintFirstMove].symbol) : null,
        h('p', { className: 'planning-robot-route__message planning-robot-route__message--' + status, 'aria-live': 'polite' }, message),
        h('div', { className: 'planning-robot-route__edit-actions' },
          h('button', { type: 'button', onClick: removeCommand, disabled: running || success || commands.length === 0 }, 'Удалить ход'),
          h('button', { type: 'button', onClick: restartCurrent, disabled: running }, 'Начать заново')),
        success
          ? h('button', { type: 'button', className: 'planning-robot-route__primary', onClick: nextLevel }, levelIndex === session.levels.length - 1 ? 'Завершить' : 'Следующий маршрут')
          : h('button', { type: 'button', className: 'planning-robot-route__primary', onClick: runProgram, disabled: running || commands.length === 0 }, running ? 'Робот в пути…' : 'Запустить')),
    ));
  }

  modules['robot-route'] = {
    Component: RobotRouteGame,
    api: Object.freeze({
      version: 1,
      validateLevels: validateLevels,
      createSession: createSession,
      bfsShortestPath: bfsShortestPath,
      executeProgram: executeProgram,
    }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
