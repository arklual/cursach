package ru.startem.aelevena.run

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class WorkflowRunRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class WorkflowRunRow(
        val id: Long,
        val workflowId: UUID,
        val workflowRevisionId: Long,
        val status: String,
        val startedAt: OffsetDateTime?,
        val finishedAt: OffsetDateTime?,
        val inputJson: String?,
        val outputJson: String?,
        val startNodeId: String?,
        val isDebug: Boolean,
        val createdAt: OffsetDateTime,
    )

    private val rowMapper: (java.sql.ResultSet, Int) -> WorkflowRunRow = { rs, _ ->
        WorkflowRunRow(
            id = rs.getLong("id"),
            workflowId = rs.getObject("workflow_id", UUID::class.java),
            workflowRevisionId = rs.getLong("workflow_revision_id"),
            status = rs.getString("status"),
            startedAt = rs.getObject("started_at", OffsetDateTime::class.java),
            finishedAt = rs.getObject("finished_at", OffsetDateTime::class.java),
            inputJson = rs.getString("input"),
            outputJson = rs.getString("output"),
            startNodeId = rs.getString("start_node_id"),
            isDebug = rs.getBoolean("is_debug"),
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
        )
    }

    fun insertQueued(
        workflowId: UUID,
        workflowRevisionId: Long,
        inputJson: String?,
        startNodeId: String?,
        isDebug: Boolean = false,
    ): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("workflowRevisionId", workflowRevisionId)
            .addValue("status", "queued")
            .addValue("input", inputJson)
            .addValue("startNodeId", startNodeId)
            .addValue("isDebug", isDebug)

        return jdbc.queryForObject(
            """
            insert into workflow_run (workflow_id, workflow_revision_id, status, input, start_node_id, is_debug)
            values (:workflowId, :workflowRevisionId, :status, :input::jsonb, :startNodeId, :isDebug)
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun findById(runId: Long): WorkflowRunRow? {
        val params = MapSqlParameterSource().addValue("runId", runId)
        val rows = jdbc.query(
            """
            select id, workflow_id, workflow_revision_id, status, started_at, finished_at, input, output, start_node_id, is_debug, created_at
            from workflow_run
            where id = :runId
            """.trimIndent(),
            params,
            rowMapper,
        )
        return rows.firstOrNull()
    }

    fun listByWorkflow(workflowId: UUID): List<WorkflowRunRow> {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.query(
            """
            select id, workflow_id, workflow_revision_id, status, started_at, finished_at, input, output, start_node_id, is_debug, created_at
            from workflow_run
            where workflow_id = :workflowId
            order by created_at desc
            """.trimIndent(),
            params,
            rowMapper,
        )
    }

    fun markRunning(runId: Long) {
        val params = MapSqlParameterSource()
            .addValue("runId", runId)
            .addValue("status", "running")
        jdbc.update(
            """
            update workflow_run
            set status = :status,
                started_at = CURRENT_TIMESTAMP
            where id = :runId
            """.trimIndent(),
            params,
        )
    }

    fun markFinished(runId: Long, status: String, outputJson: String?) {
        val params = MapSqlParameterSource()
            .addValue("runId", runId)
            .addValue("status", status)
            .addValue("output", outputJson)
        jdbc.update(
            """
            update workflow_run
            set status = :status,
                finished_at = CURRENT_TIMESTAMP,
                output = :output::jsonb
            where id = :runId
            """.trimIndent(),
            params,
        )
    }
}

