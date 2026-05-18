package ru.startem.aelevena.workflow.persistence

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class WorkflowsRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class WorkflowRow(
        val id: UUID,
        val name: String,
        val description: String?,
        val currentVersionId: Long?,
        val isDemo: Boolean,
        val createdAt: OffsetDateTime,
        val updatedAt: OffsetDateTime,
    )

    fun insert(id: UUID, name: String, description: String?, isDemo: Boolean = false) {
        val params = MapSqlParameterSource()
            .addValue("id", id)
            .addValue("name", name)
            .addValue("description", description)
            .addValue("isDemo", isDemo)

        jdbc.update(
            """
            insert into workflows (id, name, description, is_demo)
            values (:id, :name, :description, :isDemo)
            """.trimIndent(),
            params,
        )
    }

    private fun mapRow(rs: java.sql.ResultSet): WorkflowRow = WorkflowRow(
        id = rs.getObject("id", UUID::class.java),
        name = rs.getString("name"),
        description = rs.getString("description"),
        currentVersionId = rs.getObject("current_version_id")?.let { rs.getLong("current_version_id") },
        isDemo = rs.getBoolean("is_demo"),
        createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
        updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
    )

    fun findById(id: UUID): WorkflowRow? {
        val params = MapSqlParameterSource().addValue("id", id)
        val rows = jdbc.query(
            """
            select id, name, description, current_version_id, is_demo, created_at, updated_at
            from workflows
            where id = :id
            """.trimIndent(),
            params,
        ) { rs, _ -> mapRow(rs) }
        return rows.firstOrNull()
    }

    fun list(): List<WorkflowRow> =
        jdbc.query(
            """
            select id, name, description, current_version_id, is_demo, created_at, updated_at
            from workflows
            order by created_at desc
            """.trimIndent()
        ) { rs, _ -> mapRow(rs) }

    fun updateMeta(id: UUID, name: String?, description: String?): WorkflowRow? {
        val params = MapSqlParameterSource()
            .addValue("id", id)
            .addValue("name", name)
            .addValue("description", description)

        val rows = jdbc.query(
            """
            update workflows
            set name = coalesce(:name, name),
                description = coalesce(:description, description),
                updated_at = CURRENT_TIMESTAMP
            where id = :id
            returning id, name, description, current_version_id, is_demo, created_at, updated_at
            """.trimIndent(),
            params,
        ) { rs, _ -> mapRow(rs) }
        return rows.firstOrNull()
    }

    fun setCurrentVersion(workflowId: UUID, versionId: Long) {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("versionId", versionId)
        jdbc.update(
            """
            update workflows
            set current_version_id = :versionId,
                updated_at = CURRENT_TIMESTAMP
            where id = :workflowId
            """.trimIndent(),
            params,
        )
    }

    fun touchUpdatedAt(workflowId: UUID) {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        jdbc.update(
            """
            update workflows
            set updated_at = CURRENT_TIMESTAMP
            where id = :workflowId
            """.trimIndent(),
            params,
        )
    }

    fun delete(workflowId: UUID): Boolean {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.update(
            """
            delete from workflows
            where id = :workflowId
            """.trimIndent(),
            params,
        ) > 0
    }
}

