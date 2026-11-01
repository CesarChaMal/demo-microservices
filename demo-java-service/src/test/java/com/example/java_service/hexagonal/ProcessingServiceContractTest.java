package com.example.java_service.hexagonal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Seed contract test for the hexagonal ProcessingService — deliberately
 * dependency-free (no Spring context, no external services) so it runs as
 * part of {@code ./mvnw test}.
 *
 * <p>Note: ProcessingPort.java lives under {@code patterns/architectural/}
 * but declares this package; the test mirrors the package to reach the
 * package-private domain types.</p>
 */
class ProcessingServiceContractTest {

    private final ProcessingService service = new ProcessingService();

    @Test
    void doubles() {
        ProcessingResult result = service.process(new ProcessingRequest(21, "double"));
        assertEquals(42, result.result().intValue());
        assertEquals("SUCCESS", result.status());
        assertEquals("hexagonal", result.algorithm());
    }

    @Test
    void triples() {
        assertEquals(63, service.process(new ProcessingRequest(21, "triple")).result().intValue());
    }

    @Test
    void squares() {
        assertEquals(441, service.process(new ProcessingRequest(21, "square")).result().intValue());
    }

    @Test
    void unknownTypeReturnsValueUnchanged() {
        // Unlike the node/python services (whose default algorithm doubles),
        // the hexagonal port's default branch is the identity function.
        assertEquals(21, service.process(new ProcessingRequest(21, "unknown")).result().intValue());
    }
}
