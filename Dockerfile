# syntax=docker/dockerfile:1

FROM eclipse-temurin:24-jdk AS build

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends maven \
  && rm -rf /var/lib/apt/lists/*

ARG MVN_INSECURE=false

COPY pom.xml .
RUN if [ "$MVN_INSECURE" = "true" ]; then EXTRA="-Dmaven.wagon.http.ssl.insecure=true -Dmaven.wagon.http.ssl.allowall=true"; else EXTRA=""; fi; \
  mvn -q -DskipTests $EXTRA dependency:go-offline

COPY src ./src
RUN if [ "$MVN_INSECURE" = "true" ]; then EXTRA="-Dmaven.wagon.http.ssl.insecure=true -Dmaven.wagon.http.ssl.allowall=true"; else EXTRA=""; fi; \
  mvn -q -DskipTests $EXTRA package

FROM eclipse-temurin:24-jre

WORKDIR /app

COPY --from=build /workspace/target/*SNAPSHOT.jar /app/app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]

