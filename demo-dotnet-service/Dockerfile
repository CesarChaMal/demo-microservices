# demo-dotnet-service — multi-stage build (in-image restore/publish, so a fresh
# checkout builds with no local dotnet toolchain, mirroring the other services).

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Project file first so the restore layer caches independently of code changes.
COPY demo-dotnet-service.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# curl for the compose healthcheck (the base runtime image ships without it)
# and a dedicated non-root user to run under.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home dotnetsvc

COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:5003
EXPOSE 5003
USER dotnetsvc
ENTRYPOINT ["dotnet", "demo-dotnet-service.dll"]
