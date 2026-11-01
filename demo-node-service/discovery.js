// Peer resolution: Eureka registry first, compose hostname fallback.
//
// Every outbound peer call in this service goes through peerUrl() so the
// URL is picked at CALL time, not boot time:
//   1. ask the local eureka-js-client registry for UP instances of the app
//      (client-side load balancing across replicas falls out for free —
//      pick the first UP instance),
//   2. if the registry has nothing (Eureka down, peer not yet registered,
//      client not started), fall back to the compose service name — which
//      is ALSO the k8s Service name, so the fallback resolves identically
//      in `docker compose up` and on EKS.
//
// Instance host preference: ipAddr before hostName. In compose both are
// routable (container IP on micro_net / container name); on EKS the pod IP
// is routable while the registered pod hostname is not.
//
// A new peer = one line at the call site:
//   peerUrl('JAVA-SERVICE', 'http://java-service:8080')

let eurekaClient = null;

function setEurekaClient(client) {
    eurekaClient = client;
}

function peerUrl(appId, fallbackUrl) {
    if (eurekaClient) {
        try {
            const instances = eurekaClient.getInstancesByAppId(appId) || [];
            const up = instances.find((instance) => instance.status === 'UP');
            if (up && up.port && up.port['$']) {
                const host = up.ipAddr || up.hostName;
                if (host) {
                    return `http://${host}:${up.port['$']}`;
                }
            }
        } catch (err) {
            // Registry miss / client not warmed up — fall through to the
            // compose name below. The circuit breaker around the call is
            // the second safety net.
        }
    }
    return fallbackUrl;
}

module.exports = { peerUrl, setEurekaClient };
