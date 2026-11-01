"""Peer resolution: Eureka registry first, compose hostname fallback.

Every outbound peer URL in this service goes through peer_url(), so the
URL is picked at CALL time, not import time:

  1. GET {EUREKA_SERVER_URL}/apps/{APP_ID} (plain Eureka REST, same API
     guide Step 4b teaches for clientless languages) and take the first
     UP instance — ipAddr before hostName, because in compose both are
     routable while on EKS only the pod IP is;
  2. any miss (404, Eureka down, peer not yet registered) falls back to
     the compose service name — which is also the k8s Service name, so
     the fallback resolves identically in `docker compose up` and on EKS.

Why plain REST and not py_eureka_client.do_service: the circuit-breaker
decorators around the peer calls expect requests.RequestException, and
the client library raises its own exception types — wrapping would blur
the teaching example. A 10s TTL cache keeps the breaker from hammering
the registry on every failed call.

A new peer = one line at the call site:
    peer_url('JAVA-SERVICE', 'http://java-service:8080') + '/calculate'
"""

import logging
import os
import threading
import time

import requests

logger = logging.getLogger(__name__)

EUREKA_BASE = os.environ.get(
    'EUREKA_SERVER_URL', 'http://eureka-server:8761/eureka'
).rstrip('/')

_CACHE_TTL = 10.0  # seconds a registry answer is reused
_cache_lock = threading.Lock()
_cache = {}  # app_id -> (resolved_at, [instances])


def _fetch_instances(app_id):
    """Return the registry's instance list for app_id (may be empty)."""
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(app_id)
        if cached and now - cached[0] < _CACHE_TTL:
            return cached[1]

    try:
        response = requests.get(
            f'{EUREKA_BASE}/apps/{app_id}',
            headers={'Accept': 'application/json'},
            timeout=3,
        )
        if response.status_code == 404:
            instances = []  # app not registered yet
        else:
            response.raise_for_status()
            instances = response.json().get('application', {}).get('instance', [])
    except requests.RequestException:
        logger.debug('Eureka lookup failed for %s — using fallback', app_id)
        instances = []

    with _cache_lock:
        _cache[app_id] = (now, instances)
    return instances


def peer_url(app_id, fallback_url):
    """Resolve http://host:port for app_id, or the fallback URL."""
    for instance in _fetch_instances(app_id):
        if instance.get('status') != 'UP':
            continue
        host = instance.get('ipAddr') or instance.get('hostName')
        port = (instance.get('port') or {}).get('$')
        if host and port:
            return f'http://{host}:{port}'
    return fallback_url
