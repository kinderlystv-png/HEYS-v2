import path from 'path';

/**
 * Full page reload when legacy bundle manifest or build-meta changes during dev.
 * sync:local / bundle:legacy updates these while Vite is running — HMR does not
 * pick up new hashed bundle filenames in index.html.
 */
export default function vitePluginBundleManifestReload(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const watchFiles = [
    path.join(rootDir, 'bundle-manifest.json'),
    path.join(rootDir, 'public', 'bundle-manifest.json'),
    path.join(rootDir, 'public', 'build-meta.json'),
    path.join(rootDir, 'index.html'),
  ];

  return {
    name: 'heys-bundle-manifest-reload',
    configureServer(server) {
      for (const filePath of watchFiles) {
        server.watcher.add(filePath);
      }
      server.watcher.on('change', (changed) => {
        const normalized = path.resolve(changed);
        if (watchFiles.some((filePath) => path.resolve(filePath) === normalized)) {
          console.info('[sync:local] bundle manifest changed — full reload');
          server.ws.send({ type: 'full-reload', path: '*' });
        }
      });
    },
  };
}
