const { getDefaultConfig } = require("expo/metro-config");

// Expo handles workspace resolution and pnpm support automatically.
const config = getDefaultConfig(__dirname);

// Keep SVG files available as static image assets on web.
if (!config.resolver.assetExts.includes("svg")) {
  config.resolver.assetExts.push("svg");
}

module.exports = config;
