const { hostname } = require("node:os");

const EXPO_GO_MACHINES = {
  "DESKTOP-CES4UCF": "RAÚL — PC1",
  "DESKTOP-D05P009": "TESO — PC2",
};

// Expo CLI sets RCT_METRO_PORT to its resolved port before serving manifests.
// Change only the Expo Go display name; retain the app/project identity.
module.exports = ({ config }) => {
  const port = process.env.RCT_METRO_PORT;
  const machine = EXPO_GO_MACHINES[hostname().toUpperCase()];
  if (machine && (port === "8088" || port === "8089")) {
    return { ...config, name: `GO APP ${port} ${machine}` };
  }
  const name = port === "8088"
    ? "GO App · COLA TERMINADA · 8088"
    : port === "8089"
      ? "GO App · COMPROBACIONES · 8089"
      : undefined;
  return name ? { ...config, name } : config;
};
