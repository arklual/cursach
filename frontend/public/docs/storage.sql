CREATE TABLE workflow_runs (
  run_id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  mode TEXT CHECK (mode IN ('simulation','payload')),
  payload JSONB
);

CREATE TABLE node_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT REFERENCES workflow_runs(run_id),
  node_id TEXT NOT NULL,
  event_type TEXT CHECK (event_type IN ('node_reached','node_action','node_exited')),
  variant TEXT,
  user_id_hash TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  payload_summary JSONB,
  metadata JSONB,
  status TEXT,
  duration_ms INTEGER,
  INDEX (node_id, event_type)
);

CREATE MATERIALIZED VIEW node_aggregates AS
SELECT
  node_id,
  COUNT(DISTINCT CASE WHEN event_type = 'node_reached' THEN user_id_hash END) AS n_reached,
  COUNT(CASE WHEN event_type = 'node_action' AND (metadata->>'success')::boolean IS TRUE THEN 1 END) AS k_converted,
  CASE WHEN COUNT(DISTINCT CASE WHEN event_type = 'node_reached' THEN user_id_hash END) > 0
    THEN COUNT(CASE WHEN event_type = 'node_action' AND (metadata->>'success')::boolean IS TRUE THEN 1 END)::FLOAT /
         COUNT(DISTINCT CASE WHEN event_type = 'node_reached' THEN user_id_hash END)
    ELSE 0 END AS p_hat
FROM node_events
GROUP BY node_id;
