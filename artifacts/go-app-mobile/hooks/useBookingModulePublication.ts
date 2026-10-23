import { useEffect, useState } from "react";
import { defaultGoModulePublication, parseGoModulePublication } from "@workspace/api-zod";
import { supabaseApiRequest } from "@/data/booking";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";

/** UI publication is a projection; the server independently rechecks every new operation. */
export function useBookingModulePublication(visible: boolean, authorizedDemo = false) {
  const admin = useAdminAccess();
  const view = useGoView();
  const [publication, setPublication] = useState(defaultGoModulePublication);
  const internalAccess = !admin.checking && admin.allowed && admin.permissions.includes("development") && view.loaded && view.isAdminView;
  // Owning a demo repository alone must not bypass the USER pilot experience.
  const businessDemoAccess = authorizedDemo && !admin.checking && admin.allowed && admin.level === "owner"
    && view.loaded && view.isOwner && view.isBusinessPreview;
  useEffect(() => {
    let current = true;
    // No persisted privilege or data from a previous account.
    setPublication(defaultGoModulePublication());
    if (visible) void supabaseApiRequest("/supabase/module-publication").then(value => {
      if (current) setPublication(parseGoModulePublication(value));
    }).catch(() => { /* Fail closed to the pilot projection; never clear the user's data. */ });
    return () => { current = false; };
  }, [visible, admin.userId, internalAccess]);
  return { publication, internalAccess: internalAccess || businessDemoAccess, remoteInternalAccess: internalAccess };
}
