const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Permitir que Metro siga los symlinks de pnpm
config.resolver.unstable_enableSymlinks = true;

// Incluir el workspace root en watchFolders para resolver dependencias pnpm.
// Extendemos los defaults de Expo en lugar de reemplazarlos, para que
// expo-doctor no detecte entradas faltantes.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// Asegurarse de que Metro busque módulos en el store de pnpm
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Soportar SVG como asset estático (para Image source en Expo web)
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), "svg"];

// Excluir directorios temporales que Metro crea y borra durante el escaneo
// (evita ENOENT en FallbackWatcher con paquetes locales como shell-quote)
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList)
    ? defaultBlockList
    : defaultBlockList
    ? [defaultBlockList]
    : []),
  /_tmp_\d+/,
];

// ── Caché persistente ────────────────────────────────────────────────────────
// Metro guarda su caché por defecto en /tmp (se borra en cada sleep del repl).
// Lo redirigimos a una ruta dentro del workspace para que sobreviva entre sesiones
// y los arranques en caliente sean inmediatos en lugar de tardar 50+ segundos.
(function applyPersistentCache() {
  const pnpmBase = path.join(workspaceRoot, "node_modules/.pnpm");
  let FileStore = null;
  try {
    const entries = fs.readdirSync(pnpmBase).filter(d => d.startsWith("metro-cache@")).sort().reverse();
    for (const entry of entries) {
      try {
        FileStore = require(path.join(pnpmBase, entry, "node_modules/metro-cache")).FileStore;
        if (FileStore) break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* pnpm store not found — skip */ }

  if (FileStore) {
    const cacheRoot = path.join(workspaceRoot, ".metro-cache");
    try { fs.mkdirSync(cacheRoot, { recursive: true }); } catch (_) {}
    config.cacheStores = [new FileStore({ root: cacheRoot })];
  }
})();

module.exports = config;
