// demo-dotnet-service — ASP.NET Core minimal API member of the demo-microservices
// family (port 5003). Contract-first sibling of the Java/Node/Python/Go services:
// the same GET /info and POST /process endpoints, plus GET /health for the compose
// healthcheck and the Eureka health-check URL.
//
// Eureka registration goes through the real Steeltoe client (guide Step 4a) — the
// deliberate contrast with demo-go-service, which speaks the Eureka REST API itself
// because Go has no maintained client (guide Step 4b). The 32-pattern catalog is not
// implemented here (yet); see ADDING_A_MICROSERVICE.md for the family rules.

using Steeltoe.Discovery.Eureka;

var builder = WebApplication.CreateBuilder(args);

// The repo convention is a single EUREKA_SERVER_URL env var (see .env.example).
// Map it onto the Steeltoe config keys so this service configures like its
// siblings instead of growing a second env-var dialect. Values set here land
// after appsettings.json, so they win.
builder.Configuration["Eureka:Client:ServiceUrl"] =
    Environment.GetEnvironmentVariable("EUREKA_SERVER_URL") ?? "http://eureka-server:8761/eureka/";
// Contract-only member: nothing to discover yet, so skip registry polling.
// Registration itself stays on (the default) — that is the demo's point.
builder.Configuration["Eureka:Client:ShouldFetchRegistry"] = "false";
builder.Configuration["Eureka:Instance:AppName"] = "dotnet-service";
builder.Configuration["Eureka:Instance:Port"] = "5003";
builder.Configuration["Eureka:Instance:HostName"] =
    Environment.GetEnvironmentVariable("SERVICE_HOSTNAME") ?? "dotnet-service";

// Steeltoe 4.x Eureka discovery client: register, heartbeat every 30 s,
// deregister on graceful shutdown (both compose `stop` and SIGTERM paths).
builder.Services.AddEurekaDiscoveryClient();

var app = builder.Build();

// GET /info — simple-family contract shape ({"app", "status"} only).
app.MapGet("/info", () => Results.Json(new { app = "dotnet-service", status = "running" }));

// GET /health — liveness for the compose healthcheck; also the Eureka
// HealthCheckUrlPath default, so registration status tracks this endpoint.
app.MapGet("/health", () => Results.Json(new { status = "UP" }));

// POST /process — the cross-service interop contract: value * 2, exactly
// like every other family member, or the demo's peer narrative breaks.
app.MapPost("/process", (ContractRequest request) =>
    Results.Json(new ContractResponse(request.Value * 2)));

app.MapGet("/", () => Results.Json(new
{
    app = "dotnet-service",
    endpoints = new[] { "GET /info", "GET /health", "POST /process" }
}));

app.Run();

internal record ContractRequest(int Value);

internal record ContractResponse(int Result);
