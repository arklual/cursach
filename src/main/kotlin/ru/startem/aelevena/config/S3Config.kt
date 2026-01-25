package ru.startem.aelevena.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import java.net.URI

@Configuration
class S3Config {

    @Bean
    fun s3Client(props: S3Properties): S3Client {
        val credentials = AwsBasicCredentials.create(props.accessKey, props.secretKey)

        return S3Client.builder()
            .credentialsProvider(StaticCredentialsProvider.create(credentials))
            .region(Region.of(props.region))
            .endpointOverride(URI.create(props.endpoint))
            .serviceConfiguration(
                S3Configuration.builder()
                    .pathStyleAccessEnabled(props.pathStyleAccess)
                    .build()
            )
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .build()
    }
}

