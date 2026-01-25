package ru.startem.aelevena.blob

import com.fasterxml.jackson.databind.JsonNode
import org.springframework.stereotype.Service
import ru.startem.aelevena.config.S3Properties
import ru.startem.aelevena.util.CanonicalJson
import ru.startem.aelevena.util.Hashing
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest

@Service
class BlobService(
    private val s3: S3Client,
    private val props: S3Properties,
    private val index: BlobIndexRepository,
    private val canonicalJson: CanonicalJson,
) {
    fun putJsonIfMissing(value: Any): String =
        putBytesIfMissing(
            bytes = canonicalJson.writeBytes(value),
            contentType = "application/json",
        )

    fun putBytesIfMissing(bytes: ByteArray, contentType: String? = null): String {
        val hash = Hashing.sha256Hex(bytes)
        if (index.exists(hash)) {
            return hash
        }

        val key = keyForHash(hash)
        val request = PutObjectRequest.builder()
            .bucket(props.bucket)
            .key(key)
            .apply { if (contentType != null) contentType(contentType) }
            .build()

        s3.putObject(request, RequestBody.fromBytes(bytes))
        index.insertIfMissing(contentHash = hash, s3Key = key, sizeBytes = bytes.size.toLong())
        return hash
    }

    fun getBytes(contentHash: String): ByteArray {
        val request = GetObjectRequest.builder()
            .bucket(props.bucket)
            .key(keyForHash(contentHash))
            .build()

        s3.getObject(request).use { input ->
            return input.readAllBytes()
        }
    }

    fun getJsonTree(contentHash: String): JsonNode = canonicalJson.readTree(getBytes(contentHash))

    private fun keyForHash(hash: String): String = "blobs/$hash"
}

