# Spring Cloud Gateway — same base and wrapper pattern as demo-eureka-server.
FROM openjdk:22-jdk-oracle

WORKDIR /app

# Maven wrapper + pom first so the dependency layer caches independently of source.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./

RUN ./mvnw dependency:go-offline

COPY src ./src

# Build AND use the jar inside the image. Deliberately NOT `COPY target/*.jar`:
# copying from the build context would depend on a jar built on the host and
# break on a fresh checkout (which is exactly what CI gets).
RUN ./mvnw package -DskipTests && mv target/*.jar app.jar

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:8081/actuator/health || exit 1

CMD ["java", "-jar", "app.jar"]
