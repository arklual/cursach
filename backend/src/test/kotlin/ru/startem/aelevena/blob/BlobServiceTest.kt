package ru.startem.aelevena.blob

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import ru.startem.aelevena.config.S3Properties
import ru.startem.aelevena.util.CanonicalJson
import ru.startem.aelevena.util.Hashing
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.BucketAlreadyExistsException
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.CreateBucketResponse
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketResponse
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectResponse
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.amazon.awssdk.services.s3.model.S3Exception
import java.io.ByteArrayInputStream

class BlobServiceTest {

    private val s3: S3Client = mock(S3Client::class.java)
    private val index: BlobIndexRepository = mock(BlobIndexRepository::class.java)
    private val props = S3Properties(
        endpoint = "http://localhost:6005",
        region = "us-east-1",
        bucket = "test-bucket",
        accessKey = "k",
        secretKey = "s",
    )
    private val canonicalJson = CanonicalJson(ObjectMapper())
    private val maxBytes = 1024L

    private fun service(): BlobService = BlobService(s3, props, index, canonicalJson, maxBytes)

    @Test
    fun `ensureBucket no-op when bucket exists`() {
        doReturn(HeadBucketResponse.builder().build()).`when`(s3).headBucket(any(HeadBucketRequest::class.java))

        service().ensureBucket()

        verify(s3, never()).createBucket(any(CreateBucketRequest::class.java))
    }

    @Test
    fun `ensureBucket creates bucket on 404 head`() {
        val s3404 = S3Exception.builder()
            .statusCode(404)
            .awsErrorDetails(AwsErrorDetails.builder().errorCode("NoSuchBucket").build())
            .message("missing")
            .build()
        doThrow(s3404).`when`(s3).headBucket(any(HeadBucketRequest::class.java))
        doReturn(CreateBucketResponse.builder().build()).`when`(s3).createBucket(any(CreateBucketRequest::class.java))

        service().ensureBucket()

        verify(s3).createBucket(any(CreateBucketRequest::class.java))
    }

    @Test
    fun `ensureBucket rethrows non-404 S3 exception`() {
        val s3500 = S3Exception.builder()
            .statusCode(500)
            .awsErrorDetails(AwsErrorDetails.builder().errorCode("InternalError").build())
            .message("boom")
            .build()
        doThrow(s3500).`when`(s3).headBucket(any(HeadBucketRequest::class.java))

        val thrown = assertThrows(S3Exception::class.java) { service().ensureBucket() }
        assertEquals(500, thrown.statusCode())
    }

    @Test
    fun `ensureBucket swallows BucketAlreadyOwnedByYou on createBucket`() {
        val s3404 = S3Exception.builder().statusCode(404).message("missing").build()
        doThrow(s3404).`when`(s3).headBucket(any(HeadBucketRequest::class.java))
        val ownedByYou = BucketAlreadyOwnedByYouException.builder().message("yours").build()
        doThrow(ownedByYou).`when`(s3).createBucket(any(CreateBucketRequest::class.java))

        service().ensureBucket()
        verify(s3).createBucket(any(CreateBucketRequest::class.java))
    }

    @Test
    fun `ensureBucket swallows BucketAlreadyExists on createBucket`() {
        val s3404 = S3Exception.builder().statusCode(404).message("missing").build()
        doThrow(s3404).`when`(s3).headBucket(any(HeadBucketRequest::class.java))
        val alreadyExists = BucketAlreadyExistsException.builder().message("exists").build()
        doThrow(alreadyExists).`when`(s3).createBucket(any(CreateBucketRequest::class.java))

        service().ensureBucket()
        verify(s3).createBucket(any(CreateBucketRequest::class.java))
    }

    @Test
    fun `putBytesIfMissing rejects blobs over the configured limit`() {
        val tooBig = ByteArray((maxBytes + 1).toInt())
        assertThrows(IllegalArgumentException::class.java) {
            service().putBytesIfMissing(tooBig)
        }
        verify(s3, never()).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))
    }

    @Test
    fun `putBytesIfMissing uploads bytes and inserts into index`() {
        doReturn(PutObjectResponse.builder().build())
            .`when`(s3).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))

        val payload = "hello".toByteArray()
        val hash = service().putBytesIfMissing(payload, contentType = "text/plain")

        assertEquals("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", hash)
        verify(s3).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))
        verify(index).insertIfMissing(
            contentHash = hash,
            s3Key = "blobs/$hash",
            sizeBytes = payload.size.toLong(),
        )
    }

    @Test
    fun `putJsonIfMissing serializes through canonical mapper`() {
        doReturn(PutObjectResponse.builder().build())
            .`when`(s3).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))

        val hash = service().putJsonIfMissing(mapOf("b" to 2, "a" to 1))

        val hashAgain = service().putJsonIfMissing(mapOf("a" to 1, "b" to 2))
        assertEquals(hash, hashAgain)
    }

    @Test
    fun `getBytes reads the object stream and verifies integrity`() {
        val expected = "world".toByteArray()
        val hash = Hashing.sha256Hex(expected)
        val stream = ResponseInputStream(GetObjectResponse.builder().build(), ByteArrayInputStream(expected))
        doReturn(stream).`when`(s3).getObject(any(GetObjectRequest::class.java))

        val actual = service().getBytes(hash)
        assertArrayEquals(expected, actual)
    }

    @Test
    fun `getBytes throws BlobIntegrityException when stored bytes do not match requested hash`() {
        val tampered = "tampered-bytes".toByteArray()
        val stream = ResponseInputStream(GetObjectResponse.builder().build(), ByteArrayInputStream(tampered))
        doReturn(stream).`when`(s3).getObject(any(GetObjectRequest::class.java))

        assertThrows(BlobIntegrityException::class.java) {
            service().getBytes("0000000000000000000000000000000000000000000000000000000000000000")
        }
    }

    @Test
    fun `getJsonTree parses bytes via canonical mapper`() {
        val payload = "{\"k\":\"v\"}".toByteArray()
        val hash = Hashing.sha256Hex(payload)
        val stream = ResponseInputStream(GetObjectResponse.builder().build(), ByteArrayInputStream(payload))
        doReturn(stream).`when`(s3).getObject(any(GetObjectRequest::class.java))

        val node = service().getJsonTree(hash)
        assertEquals("v", node.get("k").asText())
    }

    @Test
    fun `putBytesIfMissing skips upload when index and bucket already hold the blob`() {
        doReturn(true).`when`(index).exists(anyString())
        doReturn(HeadObjectResponse.builder().build()).`when`(s3).headObject(any(HeadObjectRequest::class.java))

        val payload = "dedup-me".toByteArray()
        val hash = service().putBytesIfMissing(payload)

        assertEquals(Hashing.sha256Hex(payload), hash)
        verify(s3, never()).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))
    }

    @Test
    fun `putBytesIfMissing re-uploads when index has hash but object missing in bucket`() {
        doReturn(true).`when`(index).exists(anyString())
        doThrow(NoSuchKeyException.builder().message("gone").build())
            .`when`(s3).headObject(any(HeadObjectRequest::class.java))
        doReturn(PutObjectResponse.builder().build())
            .`when`(s3).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))

        service().putBytesIfMissing("drifted".toByteArray())

        verify(s3).putObject(any(PutObjectRequest::class.java), any(RequestBody::class.java))
    }
}
