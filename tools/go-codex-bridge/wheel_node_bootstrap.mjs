import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

// The native call resolves the permitted target directly. Windows still applies
// the same sandbox and ACL checks, without Node walking protected ancestors.
if (process.platform === "win32") {
  const portable = fs.realpathSync;
  const native = portable.native;
  fs.realpathSync = Object.assign(function realpathSync(path, options) {
    try {
      return portable(path, options);
    } catch (error) {
      if (error.code !== "EPERM") throw error;
      return native(path, options);
    }
  }, { native });
  const portableAsync = fs.realpath;
  const nativeAsync = portableAsync.native;
  fs.realpath = Object.assign(function realpath(...args) {
    const callback = args.pop();
    if (typeof callback !== "function") return portableAsync(...args, callback);
    return portableAsync(...args, (error, result) => {
      if (error?.code === "EPERM") return nativeAsync(...args, callback);
      callback(error, result);
    });
  }, { native: nativeAsync });
  // --preserve-symlinks-main lets this preload run before Node walks ancestors.
  // Restore canonical CJS entry paths so PNPM resolves each package's own deps.
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    const resolved = resolve.call(this, request, parent, isMain, options);
    return path.isAbsolute(resolved) ? native(resolved) : resolved;
  };
  // ESM resolution captures fs functions before preloads run. Its supported
  // resolve hook restores canonical file URLs after symlink-preserving lookup.
  const loader = `
    import fs from "node:fs";
    import { fileURLToPath, pathToFileURL } from "node:url";
    export async function resolve(specifier, context, nextResolve) {
      const result = await nextResolve(specifier, context);
      if (!result.url.startsWith("file:")) return result;
      const original = new URL(result.url);
      let target;
      try { target = fs.realpathSync.native(fileURLToPath(original)); }
      catch (error) {
        if (error.code === "ENOENT") return result;
        throw error;
      }
      const canonical = pathToFileURL(target);
      canonical.search = original.search;
      canonical.hash = original.hash;
      return { ...result, url: canonical.href };
    }
  `;
  Module.register("data:text/javascript;base64," + Buffer.from(loader).toString("base64"), import.meta.url);
}
