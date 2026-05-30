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
        val nodeType: String?,
        val status: String,
        val startedAt: java.time.OffsetDateTime?,
        val finishedAt: java.time.OffsetDateTime?,
        val inputJson: String?,
        val outputJson: String?,
        val errorMessage: String?,
    )

    private val rowMapper: (java.sql.ResultSet, Int) -> NodeRunRow = { rs, _ ->
        NodeRunRow(
            id = rs.getLong("id"),
            workflowRunId = rs.getLong("workflow_run_id"),
            nodeId = rs.getString("node_id"),
            nodeType = rs.getString("node_type"),
            status = rs.getString("status"),
            startedAt = rs.getObject("started_at", java.time.OffsetDateTime::class.java),
            finishedAt = rs.getObject("finished_at", java.time.OffsetDateTime::class.java),
            inputJson = rs.getString("input_json"),
            outputJson = rs.getString("output_json"),
            errorMessage = rs.getString("error_message"),
        )
    }

    fun findById(nodeRunId: Long): NodeRunRow? {
        val params = MapSqlParameterSource().addValue("id", nodeRunId)
        val rows = jdbc.query(
            """
            select id, workflow_run_id, node_id, node_type, status, started_at, finished_at, input_json, output_json, error_message
            from node_run
            where id = :id
            """.trimIndent(),
            params,
            rowMapper,
        )
        return rows.firstOrNull()
    }

    fun listByWorkflowRun(workflowRunId: Long): List<NodeRunRow> {
        val params = MapSqlParameterSource().addValue("workflowRunId", workflowRunId)
        return jdbc.query(
            """
            select id, workflow_run_id, node_id, node_type, status, started_at, finished_at, input_json, output_json, error_message
            from node_run
            where workflow_run_id = :workflowRunId
            order by id
            """.trimIndent(),
            params,
            rowMapper,
        )
    }

    fun listByWorkflowRunIds(workflowRunIds: Collection<Long>): Map<Long, List<NodeRunRow>> {
        if (workflowRunIds.isEmpty()) {
            return emptyMap()
        }
        val params = MapSqlParameterSource().addValue("workflowRunIds", workflowRunIds)
        val rows = jdbc.query(
            """
            select id, workflow_run_id, node_id, node_type, status, started_at, finished_at, input_json, output_json, error_message
            from node_run
            where workflow_run_id in (:workflowRunIds)
            order by workflow_run_id, id
            """.trimIndent(),
            params,
            rowMapper,
        )
        return rows.groupBy { it.workflowRunId }
    }

    fun insertQueued(workflowRunId: Long, nodeId: String, configHash: String?, nodeType: String?): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowRunId", workflowRunId)
            .addValue("nodeId", nodeId)
            .addValue("nodeType", nodeType)
            .addValue("configHash", configHash)
            .addValue("status", "queued")

        return jdbc.queryForObject(
            """
            insert into node_run (workflow_run_id, node_id, node_type, config_hash, status)
            values (:workflowRunId, :nodeId, :nodeType, :configHash, :status)
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

    fun markSkipped(nodeRunId: Long, reason: String?) {
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

