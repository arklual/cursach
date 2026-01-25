package ru.startem.aelevena.triggers

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class TriggersRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class TriggerRow(
        val id: Long,
        val workflowId: UUID,
        val type: String,
        val configJson: String?,
        val token: String?,
        val enabled: Boolean,
        val createdAt: OffsetDateTime,
        val updatedAt: OffsetDateTime,
    )

    fun insert(workflowId: UUID, type: String, configJson: String?, token: String?): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("type", type)
            .addValue("config", configJson)
            .addValue("token", token)

        return jdbc.queryForObject(
            """
            insert into triggers (workflow_id, type, config, token)
            values (:workflowId, :type, :config::jsonb, :token)
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun listByWorkflow(workflowId: UUID): List<TriggerRow> {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.query(
            """
            select id, workflow_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where workflow_id = :workflowId
            order by created_at desc
            """.trimIndent(),
            params,
        ) { rs, _ ->
            TriggerRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                type = rs.getString("type"),
                configJson = rs.getString("config"),
                token = rs.getString("token"),
                enabled = rs.getBoolean("enabled"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
            )
        }
    }

    fun findByToken(token: String): TriggerRow? {
        val params = MapSqlParameterSource().addValue("token", token)
        val rows = jdbc.query(
            """
            select id, workflow_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where token = :token
              and enabled = true
            limit 1
            """.trimIndent(),
            params,
        ) { rs, _ ->
            TriggerRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                type = rs.getString("type"),
                configJson = rs.getString("config"),
                token = rs.getString("token"),
                enabled = rs.getBoolean("enabled"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
            )
        }
        return rows.firstOrNull()
    }

    fun findById(triggerId: Long): TriggerRow? {
        val params = MapSqlParameterSource().addValue("triggerId", triggerId)
        val rows = jdbc.query(
            """
            select id, workflow_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where id = :triggerId
            limit 1
            """.trimIndent(),
            params,
        ) { rs, _ ->
            TriggerRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                type = rs.getString("type"),
                configJson = rs.getString("config"),
                token = rs.getString("token"),
                enabled = rs.getBoolean("enabled"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
            )
        }
        return rows.firstOrNull()
    }

    fun listEnabledScheduled(): List<TriggerRow> {
        val rows = jdbc.query(
            """
            select id, workflow_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where enabled = true
              and type in ('cron', 'interval')
            """.trimIndent()
        ) { rs, _ ->
            TriggerRow(
                id = rs.getLong("id"),
                workflowId = rs.getObject("workflow_id", UUID::class.java),
                type = rs.getString("type"),
                configJson = rs.getString("config"),
                token = rs.getString("token"),
                enabled = rs.getBoolean("enabled"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
            )
        }
        return rows
    }

    fun delete(triggerId: Long): Boolean {
        val params = MapSqlParameterSource().addValue("triggerId", triggerId)
        return jdbc.update(
            """
            delete from triggers
            where id = :triggerId
            """.trimIndent(),
            params,
        ) > 0
    }
}

