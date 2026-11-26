import { Redirect, useLocalSearchParams } from "expo-router";

// The commercial code is resolved by the server; it is never an authorization token.
export default function CommercialBusinessEntry() {
  const { code, ref } = useLocalSearchParams<{ code: string; ref?: string }>();
  const value = typeof code === "string" && (/^[0-9a-f]{64}$/i.test(code)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) ? code : "";
  const reference = typeof ref === "string" && /^[0-9a-f]{64}$/i.test(ref) ? ref : "";
  return <Redirect href={{ pathname: "/", params: { commercialCode: value, commercialRef: reference } }} />;
}
