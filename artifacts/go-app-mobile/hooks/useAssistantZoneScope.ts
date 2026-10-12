import { useEffect, useRef, useState } from "react";
import { getAuthenticatedUserId } from "@/data/booking";
import { onSessionChanged } from "@/lib/sessionEvents";
import { useGoView } from "@/contexts/GoViewContext";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";
import type { AssistantZoneScope } from "@/lib/assistantZonePreference";

/** Local preferences use existing identity/presentation; this never grants access. */
export function useAssistantZoneScope(): { scope: AssistantZoneScope | null; ready: boolean } {
  const view = useGoView(), admin = useAdminAccess(), demo = useOwnerBusinessDemo();
  const [identity, setIdentity] = useState<{ loaded: boolean; userId: string | null }>({ loaded: false, userId: null });
  const revision = useRef(0);
  const lastScope = useRef<AssistantZoneScope | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => {
      const token = ++revision.current;
      setIdentity({ loaded: false, userId: null });
      void getAuthenticatedUserId().then(userId => {
        if (alive && revision.current === token) setIdentity({ loaded: true, userId });
      }).catch(() => { if (alive && revision.current === token) setIdentity({ loaded: true, userId: null }); });
    };
    const unsubscribe = onSessionChanged(read);
    read();
    return () => { alive = false; revision.current++; unsubscribe(); };
  }, []);
  const ready = identity.loaded && view.loaded && !admin.checking
    && (!(view.isOwner && !view.isAdminView) || demo.loaded);
  const context = view.isOwner && !view.isAdminView
    ? `demo:${view.view}${view.view === "BUSINESS" && demo.demo ? ":" + demo.demo.businessId : ""}`
    : `live:${view.view}`;
  // Preserve only the cosmetic scope during foreground/permission revalidation.
  // Session changes clear identity immediately; preferences never grant DEMO access.
  if (ready) lastScope.current = identity.userId ? { userId: identity.userId, context } : null;
  return { scope: identity.loaded && identity.userId && lastScope.current?.userId === identity.userId
    ? lastScope.current : null, ready };
}