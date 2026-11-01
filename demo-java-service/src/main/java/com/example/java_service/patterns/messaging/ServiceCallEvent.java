package com.example.java_service.event;

public class ServiceCallEvent extends DomainEvent {
    private final String serviceName;
    private final String endpoint;
    private final boolean success;

    public ServiceCallEvent(String serviceName, String endpoint, boolean success) {
        super("ServiceCall");
        this.serviceName = serviceName;
        this.endpoint = endpoint;
        this.success = success;
    }

    public String getServiceName() { return serviceName; }
    public String getEndpoint() { return endpoint; }
    public boolean isSuccess() { return success; }
}
