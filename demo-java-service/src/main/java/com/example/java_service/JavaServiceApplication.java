package com.example.java_service;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@OpenAPIDefinition(info = @Info(title = "Java Service API", version = "1.0", description = "Java microservice with Eureka and Swagger"))
public class JavaServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(JavaServiceApplication.class, args);
    }
}
