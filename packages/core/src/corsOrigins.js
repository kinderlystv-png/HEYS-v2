const DEV_ALLOWED_HOSTS = ['localhost', '127.0.0.1'];
const DEV_ALLOWED_PORTS = [3000, 3001, 3002, 3003];

function buildDefaultAllowedOrigins() {
    return DEV_ALLOWED_HOSTS.flatMap((host) =>
        DEV_ALLOWED_PORTS.map((port) => `http://${host}:${port}`),
    );
}

module.exports = {
    DEV_ALLOWED_HOSTS,
    DEV_ALLOWED_PORTS,
    buildDefaultAllowedOrigins,
};
