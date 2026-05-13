package ru.startem.aelevena.workflow.persistence

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class WorkflowVersionRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class WorkflowVersionRow(
        val id: Long,
        val workflowId: UUID,
        val versionTag: String?,
        val rootRevisionId: Long,
        val createdAt: OffsetDateTime,
    )

    fun insert(workflowId: UUID, tag: String?, rootRevisionId: Long): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("tag", tag)
            .addValue("rootRevisionId", rootRevisionId)

        return jdbc.queryForObject(
            """
            insert into workflow_version (workflow_id, version_tag, root_revision_id)
            values (:workflowId, :tag, :rootRevisionId)
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun findById(versionId: Long): WorkflowVersionRow? {
        val params = MapSqlParameterSource().addValue("versionId", versionId)
        val rows = jdbc.query(
            """
            select id, workflow_id, version_tag, root_revision_id, created_at
            from workflow_version
            where id = :versionId
            """.trimIndent(),
            params,
        ) { rs, _ ->
            WorkflowVersionRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                versionTag = rs.getString("version_tag"),
                rootRevisionId = rs.getLong("root_revision_id"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            )
        }
        return rows.firstOrNull()
    }

    fun listByWorkflow(workflowId: UUID): List<WorkflowVersionRow> {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.query(
            """
            select id, workflow_id, version_tag, root_revision_id, created_at
            from workflow_version
            where workflow_id = :workflowId
            order by created_at desc
            """.trimIndent(),
            params,
        ) { rs, _ ->
            WorkflowVersionRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                versionTag = rs.getString("version_tag"),
                rootRevisionId = rs.getLong("root_revision_id"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            )
        }
    }

    fun updateRootRevision(versionId: Long, rootRevisionId: Long): Boolean {
        val params = MapSqlParameterSource()
            .addValue("versionId", versionId)
            .addValue("rootRevisionId", rootRevisionId)
        return jdbc.update(
            """
            update workflow_version
            set root_revision_id = :rootRevisionId
            where id = :versionId
            """.trimIndent(),
            params,
        ) > 0
    }
}

