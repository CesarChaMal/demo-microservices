# Use a base image with Java (specify the version you need)
FROM openjdk:11

# Set the working directory in the Docker container
WORKDIR /app

# Optionally copy the Maven/Gradle wrapper and definition files
COPY mvnw pom.xml ./
COPY .mvn .mvn
# Install dependencies to improve build time
RUN ./mvnw dependency:go-offline

# Copy the source code into the Docker container
COPY src ./src

# Build the application
RUN ./mvnw package -DskipTests

# There should be a single .jar file in the target directory, adjust this if necessary
ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

# Command to run the application
CMD ["java", "-jar", "app.jar"]

