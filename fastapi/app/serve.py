"""Entrypoint for the container: serve the app on one dual-stack socket.

`uvicorn --host ::` binds a single AF_INET6 socket and leaves IPV6_V6ONLY at the
kernel default, so whether IPv4 clients can reach it depends on a sysctl the image
does not control. On Railway that matters, because the two things that connect to
this service arrive differently: private-network traffic from oauth2-proxy is IPv6,
and the platform's healthcheck probe is not. A v6-only socket answers one and
silently refuses the other, which shows up as a deploy that runs fine in the logs
and still fails its healthcheck.

nginx solves the same problem in infra/web.nginx.conf.template by declaring both
`listen ${PORT}` and `listen [::]:${PORT}`. uvicorn takes one --host, so the socket
is built here instead and handed to it: AF_INET6 with IPV6_V6ONLY explicitly off
accepts both families on one listener, whatever the sysctl says.
"""

import os
import socket

import uvicorn
from loguru import logger

from app.main import app

# Same default as the Dockerfile's fallback, for a plain `python -m app.serve`.
DEFAULT_PORT = 8080
# Generous, and well under the container's file-descriptor limit.
BACKLOG = 2048


def listen_socket(port: int) -> socket.socket:
    """A dual-stack listener where IPv6 exists, an IPv4 one where it does not.

    Not every environment has IPv6: a container built without it raises
    EAFNOSUPPORT on AF_INET6, and refusing to start there would trade a
    healthcheck failure for a crash loop. Railway has IPv6 and takes the first
    branch; a v6-less CI container or sandbox takes the second and still serves.
    """
    try:
        sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    except OSError as exc:
        logger.warning("No IPv6 on this host ({}); listening on 0.0.0.0 only", exc)
        return _ipv4_socket(port)

    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # The line this module exists for. 0 means "also accept IPv4-mapped addresses".
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        sock.bind(("::", port))
        sock.listen(BACKLOG)
    except OSError as exc:
        sock.close()
        logger.warning("Could not bind a dual-stack socket ({}); falling back to IPv4", exc)
        return _ipv4_socket(port)

    sock.set_inheritable(True)
    logger.info("Listening on [::]:{} (dual-stack)", port)
    return sock


def _ipv4_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", port))
    sock.listen(BACKLOG)
    sock.set_inheritable(True)
    logger.info("Listening on 0.0.0.0:{}", port)
    return sock


def main() -> None:
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    sock = listen_socket(port)
    # log_config=None: app.core.logging already routed stdlib logging into loguru,
    # and uvicorn's own dictConfig would replace those handlers.
    server = uvicorn.Server(uvicorn.Config(app, log_config=None))
    server.run(sockets=[sock])


if __name__ == "__main__":
    main()
