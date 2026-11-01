package com.example.gateway_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * API Gateway for the demo microservices.
 *
 * A Spring Cloud Gateway that registers with Eureka and forwards every
 * {@code /<service>/**} path to {@code lb://<SERVICE>} (client-side load
 * balanced through the Eureka registry), stripping the first path segment:
 *
 * <pre>
 * http://localhost:8081/java/process   -> JAVA-SERVICE   /process
 * http://localhost:8081/node/info      -> NODE-SERVICE   /info
 * http://localhost:8081/python/process -> PYTHON-SERVICE /process
 * http://localhost:8081/go/info        -> GO-SERVICE     /info
 * </pre>
 *
 * This is the "real" counterpart of the in-process API-gateway pattern each
 * full service implements (e.g. {@code patterns/integration/apiGateway.js}):
 * same idea, promoted to a dedicated, discoverable edge service.
 */
@SpringBootApplication
public class GatewayServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayServiceApplication.class, args);
    }
}
