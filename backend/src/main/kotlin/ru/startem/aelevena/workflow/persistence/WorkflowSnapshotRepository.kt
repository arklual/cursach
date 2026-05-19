package ru.startem.aelevena.workflow.persistence

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class WorkflowSnapshotRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class WorkflowSnapshotRow(
        val id: Long,
        val workflowId: UUID,
        val revisionId: Long,
        val name: String,
        val description: String?,
        val createdAt: OffsetDateTime,
    )

    fun insert(workflowId: UUID, revisionId: Long, name: String, description: String?): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("revisionId", revisionId)
            .addValue("name", name)
            .addValue("description", description)

        return jdbc.queryForObject(
            """
            insert into workflow_snapshot (workflow_id, revision_id, name, description)
            values (:workflowId, :revisionId, :name, :description)
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun findById(id: Long): WorkflowSnapshotRow? {
        val params = MapSqlParameterSource().addValue("id", id)
        val rows = jdbc.query(
            """
            select id, workflow_id, revision_id, name, description, created_at
            from workflow_snapshot
            where id = :id
            """.trimIndent(),
            params,
        ) { rs, _ -> mapRow(rs) }
        return rows.firstOrNull()
    }

    fun listByWorkflow(workflowId: UUID): List<WorkflowSnapshotRow> {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.query(
            """
            select id, workflow_id, revision_id, name, description, created_at
            from workflow_snapshot
            where workflow_id = :workflowId
            order by created_at desc
            """.trimIndent(),
            params,
        ) { rs, _ -> mapRow(rs) }
    }

    fun delete(id: Long): Boolean {
        val params = MapSqlParameterSource().addValue("id", id)
        return jdbc.update(
            """
            delete from workflow_snapshot
            where id = :id
            """.trimIndent(),
            params,
        ) > 0
    }

    private fun mapRow(rs: java.sql.ResultSet): WorkflowSnapshotRow = WorkflowSnapshotRow(
        id = rs.getLong("id"),
        workflowId = rs.getObject("workflow_id", UUID::class.java),
        revisionId = rs.getLong("revision_id"),
        name = rs.getString("name"),
        description = rs.getString("description"),
        createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
    )
}
