package ru.startem.aelevena.run

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class NodeRunRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class NodeRunRow(
        val id: Long,
        val workflowRunId: Long,
        val nodeId: String,
        val status: String,
        val startedAt: java.time.OffsetDateTime?,
        val finishedAt: java.time.OffsetDateTime?,
        val inputJson: String?,
        val outputJson: String?,
        val errorMessage: String?,
    )

    fun findById(nodeRunId: Long): NodeRunRow? {
        val params = MapSqlParameterSource().addValue("id", nodeRunId)
        val rows = jdbc.query(
            """
            select id, workflow_run_id, node_id, status, started_at, finished_at, input_json, output_json, error_message
            from node_run
            where id = :id
            """.trimIndent(),
            params,
        ) { rs, _ ->
            NodeRunRow(
                id = rs.getLong("id"),
                workflowRunId = rs.getLong("workflow_run_id"),
                nodeId = rs.getString("node_id"),
                status = rs.getString("status"),
                startedAt = rs.getObject("started_at", java.time.OffsetDateTime::class.java),
                finishedAt = rs.getObject("finished_at", java.time.OffsetDateTime::class.java),
                inputJson = rs.getString("input_json"),
                outputJson = rs.getString("output_json"),
                errorMessage = rs.getString("error_message"),
            )
        }
        return rows.firstOrNull()
    }

    fun insertQueued(workflowRunId: Long, nodeId: String, configHash: String?): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowRunId", workflowRunId)
            .addValue("nodeId", nodeId)
            .addValue("configHash", configHash)
            .addValue("status", "queued")

        return jdbc.queryForObject(
            """
            insert into node_run (workflow_run_id, node_id, config_hash, status)
            values (:workflowRunId, :nodeId, :configHash, :status)
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun markRunning(nodeRunId: Long, inputJson: String?) {
        val params = MapSqlParameterSource()
            .addValue("id", nodeRunId)
            .addValue("status", "running")
            .addValue("input", inputJson)
        jdbc.update(
            """
            update node_run
            set status = :status,
                started_at = CURRENT_TIMESTAMP,
                input_json = :input::jsonb
            where id = :id
            """.trimIndent(),
            params,
        )
    }

    fun markSuccess(nodeRunId: Long, outputJson: String?) {
        val params = MapSqlParameterSource()
            .addValue("id", nodeRunId)
            .addValue("status", "success")
            .addValue("output", outputJson)
        jdbc.update(
            """
            update node_run
            set status = :status,
                finished_at = CURRENT_TIMESTAMP,
                output_json = :output::jsonb
            where id = :id
            """.trimIndent(),
            params,
        )
    }

    fun markFailed(nodeRunId: Long, errorMessage: String, outputJson: String? = null) {
        val params = MapSqlParameterSource()
            .addValue("id", nodeRunId)
            .addValue("status", "failed")
            .addValue("errorMessage", errorMessage)
            .addValue("output", outputJson)
        jdbc.update(
            """
            update node_run
            set status = :status,
                finished_at = CURRENT_TIMESTAMP,
                error_message = :errorMessage,
                output_json = :output::jsonb
            where id = :id
            """.trimIndent(),
            params,
        )
    }

    fun markSkipped(nodeRunId: Long, reason: String? = null) {
        val params = MapSqlParameterSource()
            .addValue("id", nodeRunId)
            .addValue("status", "skipped")
            .addValue("reason", reason)
        jdbc.update(
            """
            update node_run
            set status = :status,
                finished_at = CURRENT_TIMESTAMP,
                error_message = coalesce(:reason, error_message)
            where id = :id
            """.trimIndent(),
            params,
        )
    }
}

