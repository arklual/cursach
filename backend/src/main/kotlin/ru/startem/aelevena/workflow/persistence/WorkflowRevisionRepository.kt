package ru.startem.aelevena.workflow.persistence

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class WorkflowRevisionRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class WorkflowRevisionRow(
        val id: Long,
        val workflowId: UUID,
        val revisionNumber: Int,
        val graphSkeletonJson: String,
        val createdAt: OffsetDateTime,
    )

    fun nextRevisionNumber(workflowId: UUID): Int {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.queryForObject(
            """
            select coalesce(max(revision_number), 0) + 1
            from workflow_revision
            where workflow_id = :workflowId
            """.trimIndent(),
            params,
            Int::class.java,
        ) ?: 1
    }

    fun insert(workflowId: UUID, revisionNumber: Int, graphSkeletonJson: String): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("revisionNumber", revisionNumber)
            .addValue("graphSkeleton", graphSkeletonJson)

        return jdbc.queryForObject(
            """
            insert into workflow_revision (workflow_id, revision_number, graph_skeleton)
            values (:workflowId, :revisionNumber, :graphSkeleton::jsonb)
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun findById(id: Long): WorkflowRevisionRow? {
        val params = MapSqlParameterSource().addValue("id", id)
        val rows = jdbc.query(
            """
            select id, workflow_id, revision_number, graph_skeleton, created_at
            from workflow_revision
            where id = :id
            """.trimIndent(),
            params,
        ) { rs, _ ->
            WorkflowRevisionRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                revisionNumber = rs.getInt("revision_number"),
                graphSkeletonJson = rs.getString("graph_skeleton"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            )
        }
        return rows.firstOrNull()
    }
}

