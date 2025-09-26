# Using a common and stable base image for Java applications.
# This ensures that the JDK version is suitable and stable for running the Java application.
FROM openjdk:22-jdk-oracle

# Set the working directory inside the container to /app.
# This is where all files will be placed and commands will be run.
WORKDIR /app

# Copy Maven wrapper executable and its support files, along with the project's pom.xml.
# The Maven wrapper ensures that you use a consistent Maven version for the build.
COPY mvnw pom.xml ./
COPY .mvn/ .mvn/

# Pre-download all project dependencies to cache them. This step is cached unless pom.xml changes.
# This reduces build time by avoiding repeated downloads of existing dependencies.
RUN ./mvnw dependency:go-offline

# Copy the actual source code of the application into the container.
# This includes all Java and resource files located in the src directory.
COPY src ./src

# Run Maven package to build the application, skipping unit tests to speed up the build process.
# This produces a JAR file in the target directory.
RUN ./mvnw package -DskipTests

# Copy the built JAR file from the build stage into the /app directory in the container.
# This is the executable JAR that contains your application.
COPY target/*.jar app.jar

# Declare the port on which the container should listen for connections.
# This should match the port that your application uses.
EXPOSE 8761

# Health check to ensure the service is available.
# This uses the Spring Boot actuator health endpoint to check application health.
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=5 \
  CMD curl -f http://localhost:8761/actuator/health || exit 1

# Command to run the application.
# This starts the Java application using the standard java command to run the JAR file.
CMD ["java", "-jar", "app.jar"]
