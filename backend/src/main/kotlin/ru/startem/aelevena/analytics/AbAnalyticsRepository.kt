package ru.startem.aelevena.analytics

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class AbAnalyticsRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    data class VariantRow(
        val runId: Long,
        val runStatus: String,
        val abOutputJson: String?,
    )

    fun findVariantRows(workflowId: UUID, abNodeId: String): List<VariantRow> {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("abNodeId", abNodeId)
        return jdbc.query(
            """
            select wr.id as run_id, wr.status as run_status, nr.output_json::text as ab_output
            from workflow_run wr
            join node_run nr
              on nr.workflow_run_id = wr.id
             and nr.node_id = :abNodeId
            where wr.workflow_id = :workflowId
              and wr.status in ('success', 'failed')
              and nr.status = 'success'
            """.trimIndent(),
            params,
        ) { rs, _ ->
            VariantRow(
                runId = rs.getLong("run_id"),
                runStatus = rs.getString("run_status"),
                abOutputJson = rs.getString("ab_output"),
            )
        }
    }

    fun countRunsWithoutAbNode(workflowId: UUID, abNodeId: String): Int {
        val params = MapSqlParameterSource()
            .addValue("workflowId", workflowId)
            .addValue("abNodeId", abNodeId)
        return jdbc.queryForObject(
            """
            select count(*)
            from workflow_run wr
            where wr.workflow_id = :workflowId
              and wr.status in ('success', 'failed')
              and not exists (
                select 1 from node_run nr
                where nr.workflow_run_id = wr.id
                  and nr.node_id = :abNodeId
                  and nr.status = 'success'
              )
            """.trimIndent(),
            params,
            Int::class.java,
        ) ?: 0
    }
}
