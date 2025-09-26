package com.example.java_service.hexagonal;

// Domain Port (Interface)
public interface ProcessingPort {
    ProcessingResult process(ProcessingRequest request);
}

// Domain Models
record ProcessingRequest(Integer value, String type) {}
record ProcessingResult(Integer result, String status, String algorithm) {}

// Domain Service (Core Business Logic)
@org.springframework.stereotype.Service
class ProcessingService implements ProcessingPort {
    
    @Override
    public ProcessingResult process(ProcessingRequest request) {
        // Core business logic - no dependencies on external frameworks
        int result = switch (request.type()) {
            case "double" -> request.value() * 2;
            case "triple" -> request.value() * 3;
            case "square" -> request.value() * request.value();
            default -> request.value();
        };
        
        return new ProcessingResult(result, "SUCCESS", "hexagonal");
    }
}