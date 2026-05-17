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
        val nodeId: String,
        val type: String,
        val configJson: String?,
        val token: String?,
        val enabled: Boolean,
        val createdAt: OffsetDateTime,
        val updatedAt: OffsetDateTime,
    )

    private val rowMapper: (java.sql.ResultSet, Int) -> TriggerRow = { rs, _ ->
        TriggerRow(
            id = rs.getLong("id"),
            workflowId = rs.getObject("workflow_id", UUID::class.java),
            nodeId = rs.getString("node_id"),
            type = rs.getString("type"),
            configJson = rs.getString("config"),
            token = rs.getString("token"),
            enabled = rs.getBoolean("enabled"),
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
        )
    }

    fun listByWorkflow(workflowId: UUID): List<TriggerRow> {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        return jdbc.query(
            """
            select id, workflow_id, node_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where workflow_id = :workflowId
            order by created_at desc
            """.trimIndent(),
            params,
            rowMapper,
        )
    }

    fun findByToken(token: String): TriggerRow? {
        val params = MapSqlParameterSource().addValue("token", token)
        val rows = jdbc.query(
            """
            select id, workflow_id, node_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where token = :token
              and enabled = true
            limit 1
            """.trimIndent(),
            params,
            rowMapper,
        )
        return rows.firstOrNull()
    }

    fun findByWorkflowAndNode(workflowId: UUID, nodeId: String): TriggerRow? {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("nodeId", nodeId)
        val rows = jdbc.query(
            """
            select id, workflow_id, node_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where workflow_id = :workflowId and node_id = :nodeId
            limit 1
            """.trimIndent(),
            params,
            rowMapper,
        )
        return rows.firstOrNull()
    }

    fun findById(triggerId: Long): TriggerRow? {
        val params = MapSqlParameterSource().addValue("triggerId", triggerId)
        val rows = jdbc.query(
            """
            select id, workflow_id, node_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where id = :triggerId
            limit 1
            """.trimIndent(),
            params,
            rowMapper,
        )
        return rows.firstOrNull()
    }

    fun listEnabledScheduled(): List<TriggerRow> {
        return jdbc.query(
            """
            select id, workflow_id, node_id, type, config, token, enabled, created_at, updated_at
            from triggers
            where enabled = true
              and type in ('cron', 'interval')
            """.trimIndent(),
            rowMapper,
        )
    }

    /**
     * Insert or update a trigger row keyed on (workflow_id, node_id).
     * Returns the (possibly updated) row id.
     */
    fun upsertByWorkflowAndNode(
        workflowId: UUID,
        nodeId: String,
        type: String,
        configJson: String?,
        token: String?,
    ): Long {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("nodeId", nodeId)
            .addValue("type", type)
            .addValue("config", configJson)
            .addValue("token", token)

        return jdbc.queryForObject(
            """
            insert into triggers (workflow_id, node_id, type, config, token)
            values (:workflowId, :nodeId, :type, :config::jsonb, :token)
            on conflict (workflow_id, node_id) do update
            set type = excluded.type,
                config = excluded.config,
                token = coalesce(triggers.token, excluded.token),
                updated_at = CURRENT_TIMESTAMP
            returning id
            """.trimIndent(),
            params,
            Long::class.java,
        )!!
    }

    fun deleteByWorkflowIdAndNodeIdNotIn(workflowId: UUID, keepNodeIds: Collection<String>): List<Long> {
        val params = MapSqlParameterSource().addValue("workflowId", workflowId)
        val sql = if (keepNodeIds.isEmpty()) {
            """
            delete from triggers
            where workflow_id = :workflowId
            returning id
            """.trimIndent()
        } else {
            params.addValue("keep", keepNodeIds)
            """
            delete from triggers
            where workflow_id = :workflowId
              and node_id not in (:keep)
            returning id
            """.trimIndent()
        }
        return jdbc.query(sql, params) { rs, _ -> rs.getLong("id") }
    }
}
