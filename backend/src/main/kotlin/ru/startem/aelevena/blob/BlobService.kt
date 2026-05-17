package ru.startem.aelevena.blob

import com.fasterxml.jackson.databind.JsonNode
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import ru.startem.aelevena.config.S3Properties
import ru.startem.aelevena.util.CanonicalJson
import ru.startem.aelevena.util.Hashing
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.BucketAlreadyExistsException
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception

@Service
class BlobService(
    private val s3: S3Client,
    private val props: S3Properties,
    private val index: BlobIndexRepository,
    private val canonicalJson: CanonicalJson,
    @Value("\${app.blob.max-size-bytes:104857600}")
    private val maxSizeBytes: Long,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Ensure the configured bucket exists. The compose-level `minio-init` sidecar only seeds the
     * bucket once at first boot and is marked `restart: "no"` — if the bucket is later removed (volume
     * wipe, manual cleanup), every putObject() fails with NoSuchBucket → 500. Creating it here makes
     * the backend self-healing across MinIO state drift.
     */
    @PostConstruct
    fun ensureBucket() {
        try {
            s3.headBucket(HeadBucketRequest.builder().bucket(props.bucket).build())
            return
        } catch (e: S3Exception) {
            // MinIO returns plain S3Exception with statusCode 404 instead of NoSuchBucketException —
            // anything else (auth, network, …) we surface so the boot fails loudly.
            if (e.statusCode() != 404) throw e
        }
        try {
            s3.createBucket(CreateBucketRequest.builder().bucket(props.bucket).build())
            log.info("Created S3 bucket '{}' on startup (was missing)", props.bucket)
        } catch (_: BucketAlreadyOwnedByYouException) {
        } catch (_: BucketAlreadyExistsException) {
        }
    }

    fun putJsonIfMissing(value: Any): String =
        putBytesIfMissing(
            bytes = canonicalJson.writeBytes(value),
            contentType = "application/json",
        )

    fun putBytesIfMissing(bytes: ByteArray, contentType: String? = null): String {
        require(bytes.size.toLong() <= maxSizeBytes) {
            "Blob size ${bytes.size} exceeds limit $maxSizeBytes bytes"
        }
        val hash = Hashing.sha256Hex(bytes)
        val key = keyForHash(hash)

        // Always upload: content-addressed PUT is idempotent and the index can be stale relative
        // to the bucket (e.g. MinIO volume wiped while Postgres survives). Trusting the index alone
        // makes a subsequent getBytes() fail with NoSuchKey.
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

