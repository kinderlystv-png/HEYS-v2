-- Телеметрия MCP-коннектора: суточные агрегаты (heys/8e2188).
--
-- Сырьё живёт в `mcp_call_events` (heys-mcp пишет через heys-api-rpc).
-- Сюда суточный джоб складывает только агрегат: ни одного идентификатора человека, ни
-- аргументов, ни тел. При этом условии таблицы не попадают в перечень
-- обработки ПДн — если кто-то добавит client_id или curator_id, квалификация
-- меняется и запись обязана попасть в перечень со сроком хранения.
--
-- Идемпотентность: PK по (день, ключ). Повторный прогон за ту же дату
-- перезаписывает строки, а не задваивает — джоб можно гонять сколько угодно.

CREATE TABLE IF NOT EXISTS mcp_call_daily (
  day               date    NOT NULL,
  tool              text    NOT NULL,
  calls             integer NOT NULL DEFAULT 0,
  err_count         integer NOT NULL DEFAULT 0,
  rejected_count    integer NOT NULL DEFAULT 0,
  p50_ms            integer,
  p95_ms            integer,
  max_ms            integer,
  -- Суммарное время — то, по чему сортируется отчёт: оптимизировать надо
  -- частый средний вызов, а не редкий медленный.
  total_ms          bigint  NOT NULL DEFAULT 0,
  avg_resp_bytes    integer,
  avg_upstream_calls numeric(6,2),
  cold_starts       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, tool)
);

CREATE INDEX IF NOT EXISTS mcp_call_daily_day_idx ON mcp_call_daily (day DESC);

-- Пары «предыдущий инструмент → следующий» внутри одного подключения.
-- Главная потеря в MCP — не медленный инструмент, а лишний круг: модель
-- вызывает tasks_context и list_clients там, где хватало прямой записи.
-- Видно это только на связке, поэтому пары считаются отдельно.
CREATE TABLE IF NOT EXISTS mcp_seq_daily (
  day        date    NOT NULL,
  tool_prev  text    NOT NULL,
  tool_next  text    NOT NULL,
  count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, tool_prev, tool_next)
);

CREATE INDEX IF NOT EXISTS mcp_seq_daily_day_idx ON mcp_seq_daily (day DESC);

COMMENT ON TABLE mcp_call_daily IS
  'Суточный агрегат вызовов MCP по инструментам. Без идентификаторов людей: не ПДн.';
COMMENT ON TABLE mcp_seq_daily IS
  'Суточный агрегат пар последовательных вызовов MCP. Без идентификаторов людей: не ПДн.';
