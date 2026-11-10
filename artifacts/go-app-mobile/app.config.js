// Expo CLI sets RCT_METRO_PORT to its resolved port before serving manifests.
// Change only the Expo Go display name; retain the app/project identity.
module.exports = ({ config }) => {
  const port = process.env.RCT_METRO_PORT;
  const name = port === "8088"
    ? "GO App · COLA TERMINADA · 8088"
    : port === "8089"
      ? "GO App · COMPROBACIONES · 8089"
      : undefined;
  return name ? { ...config, name } : config;
};
