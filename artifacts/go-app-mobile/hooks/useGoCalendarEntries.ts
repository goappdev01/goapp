import { useCompletionDocument } from "./useActionCompletion";
import { completionDecision, completionDiscarded, ownedCompletionEntry } from "@/lib/goActionCompletion";
import { useEffect, useState } from "react";
import type { GoEntry } from "@/components/AgendaOperativa";
import { getTaskUser, isPersonalTask, type OwnedGoEntry } from "@/lib/goTaskAccess";
import { onSessionChanged } from "@/lib/sessionEvents";

/** Calendar presentation only; records and ownership remain in the shared store. */
export function useGoCalendarEntries(entries: GoEntry[]): GoEntry[] {
  const completion = useCompletionDocument();
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    const refresh = () => {
      const request = ++version;
      setOwner(null);
      void getTaskUser().then(user => {
        if (active && request === version) setOwner(user);
      }).catch(() => {
        if (active && request === version) setOwner(null);
      });
    };
    const unsubscribe = onSessionChanged(refresh);
    refresh();
    return () => { active = false; ++version; unsubscribe(); };
  }, []);
  return entries.filter(entry => {
    const recordOwner = (entry as OwnedGoEntry).ownerUserId;
    return (recordOwner ? recordOwner === owner : !isPersonalTask(entry))
      && !(completion.doc && completionDiscarded(entry,completion.doc));
  }).map(entry => ({ ...entry, localResolutionStatus: completion.doc && ownedCompletionEntry(entry, completion.doc.scope)
    ? completionDecision(entry, completion.doc)?.status : undefined }));
}
