package ru.startem.aelevena.blob

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class BlobIndexRepository(
    private val jdbc: NamedParameterJdbcTemplate,
) {
    fun exists(hash: String): Boolean {
        val params = MapSqlParameterSource().addValue("hash", hash)
        val rows = jdbc.queryForList(
            """
            select 1
            from blob_index
            where content_hash = :hash
            limit 1
            """.trimIndent(),
            params,
            Int::class.java,
        )
        return rows.isNotEmpty()
    }

    fun insertIfMissing(
        contentHash: String,
        s3Key: String,
        sizeBytes: Long,
        storageClass: String? = null,
    ) {
        val params = MapSqlParameterSource()
            .addValue("contentHash", contentHash)
            .addValue("s3Key", s3Key)
            .addValue("sizeBytes", sizeBytes)
            .addValue("storageClass", storageClass)

        jdbc.update(
            """
            insert into blob_index (content_hash, s3_key, size_bytes, storage_class)
            values (:contentHash, :s3Key, :sizeBytes, :storageClass)
            on conflict (content_hash) do nothing
            """.trimIndent(),
            params,
        )
    }
}

