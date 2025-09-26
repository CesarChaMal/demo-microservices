# Using a specific JDK image from Oracle; ensure the version is available.
# This base image includes the JDK environment needed to run your Java application.
FROM openjdk:22-jdk-oracle

# Set the working directory inside the container to /app.
# This is where all the commands will run from.
WORKDIR /app

# Copy Maven wrapper executable and its support files, along with the project's pom.xml.
# The Maven wrapper ensures that you use a consistent Maven version for the build.
COPY .mvn/ .mvn
COPY mvnw pom.xml ./

# Pre-download all project dependencies. This step is cached unless pom.xml changes.
# This reduces build time by avoiding repeated downloads of existing dependencies.
RUN ./mvnw dependency:go-offline

# Copy the source code into the container's work directory.
# This includes all your application's source code placed under the src directory.
COPY src ./src

# The command to run the application using Maven.
# This runs the application directly from source using Maven's Spring Boot run goal.
CMD ["./mvnw", "spring-boot:run"]
