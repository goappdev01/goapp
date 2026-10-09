export type VoiceLocale = "es-ES";
export type VoiceEngine = "verified-local" | "system" | "external";

export type VoiceAuthorization = {
  providerId: string;
  engine: VoiceEngine;
  network: "deny" | "allow";
  cost: "deny" | "allow";
};

// Evidence belongs to this locale and the current device/OS/model configuration.
// A future adapter must revalidate it; these declarations cannot prove locality.
export type LocalVoiceEvidence = {
  locale: VoiceLocale;
  onDeviceEnforced: boolean;
  modelReady: boolean;
  offlineTestPassed: boolean;
  networkAuditPassed: boolean;
  reference: string;
};

export type VoiceCapability = {
  locale: string;
  available: boolean;
  fileInput: boolean;
  network: "none" | "possible" | "required";
  cost: "none" | "possible";
  localEvidence?: LocalVoiceEvidence;
};

export type VoiceProviderRequest = {
  locale: VoiceLocale;
  audioFileUri: string;
  signal: AbortSignal;
  requiresOnDeviceRecognition: boolean;
  networkAllowed: boolean;
  costAllowed: boolean;
};

export type VoiceProviderSession = {
  // Settle only after releasing audio, native listeners and requests, including
  // on failure. Aggregate native segments into exactly one final transcript.
  completion: Promise<{ text: string }>;
  // Resolve only when resources are released. Cancelling never delivers text.
  cancel(): Promise<void>;
};

export type VoiceProvider = {
  readonly id: string;
  readonly engine: VoiceEngine;
  // Inspect local/cached availability only: no audio, network, model download
  // or permission prompt. A capability query may be cancelled without cleanup.
  getCapability(locale: VoiceLocale, signal: AbortSignal): Promise<VoiceCapability>;
  // Return the cleanup handle synchronously. A synchronous throw must leave
  // no active resources. The adapter must honor the supplied execution policy.
  start(request: VoiceProviderRequest): VoiceProviderSession;
};

export type VoiceRequest = {
  locale: VoiceLocale;
  audioFileUri: string;
  authorizations: readonly VoiceAuthorization[];
};

export type VoiceAttempt = {
  providerId: string;
  engine: VoiceEngine;
  reason:
    | "authorization-required"
    | "network-authorization-required"
    | "cost-authorization-required"
    | "unsupported"
    | "local-evidence-required"
    | "capability-error"
    | "provider-error"
    | "no-transcript";
};

export type VoiceOutcome =
  | { status: "completed"; providerId: string; engine: VoiceEngine; text: string }
  | { status: "cancelled" | "busy" }
  | { status: "invalid-request"; reason: "unsupported-locale" | "local-file-required" }
  | { status: "unavailable" | "failed"; attempts: VoiceAttempt[] };

export type VoiceTranscriptionTask = {
  result: Promise<VoiceOutcome>;
  cancel(): Promise<void>;
};

function immediateTask(outcome: VoiceOutcome): VoiceTranscriptionTask {
  return { result: Promise.resolve(outcome), cancel: async () => {} };
}

function hasLocalEvidence(capability: VoiceCapability): boolean {
  const evidence = capability.localEvidence;
  return (
    capability.network === "none" &&
    capability.cost === "none" &&
    evidence?.locale === "es-ES" &&
    evidence.onDeviceEnforced === true &&
    evidence.modelReady === true &&
    evidence.offlineTestPassed === true &&
    evidence.networkAuditPassed === true &&
    typeof evidence.reference === "string" &&
    evidence.reference.trim().length > 0
  );
}

// Pure preparation: importing this file creates no provider, recording or API
// request. Share one coordinator per future audio owner to prevent overlap.
export function createVoiceTranscription(providers: readonly VoiceProvider[]) {
  const priority: Record<VoiceEngine, number> = {
    "verified-local": 0,
    system: 1,
    external: 2,
  };

  const registry = providers.map((provider) => ({
    id: provider.id,
    engine: provider.engine,
    getCapability: provider.getCapability.bind(provider),
    start: provider.start.bind(provider),
  })).sort((left, right) => priority[left.engine] - priority[right.engine]);
  if (
    registry.some((provider) => !provider.id.trim()) ||
    new Set(registry.map((provider) => provider.id)).size !== registry.length
  ) {
    throw new Error("Voice providers need unique, non-empty IDs.");
  }
  let active = false;

  return {
    start(request: VoiceRequest): VoiceTranscriptionTask {
      if (active) return immediateTask({ status: "busy" });
      if (request.locale !== "es-ES") {
        return immediateTask({ status: "invalid-request", reason: "unsupported-locale" });
      }
      if (!/^file:\/\/\/.+/.test(request.audioFileUri)) {
        return immediateTask({ status: "invalid-request", reason: "local-file-required" });
      }
      const audioFileUri = request.audioFileUri;
      const authorizations = request.authorizations.map((authorization) => ({ ...authorization }));
      const controller = new AbortController();
      let cancelled = false;
      let finished = false;
      let current: VoiceProviderSession | undefined;
      let stopping: Promise<void> | undefined;
      let notifyCancellation!: () => void;
      const cancellation = new Promise<null>((resolve) => {
        notifyCancellation = () => resolve(null);
      });
      active = true;

      function stopCurrent(): Promise<void> {
        if (!current) return Promise.resolve();
        const session = current;
        stopping ??= Promise.resolve()
          .then(() => session.cancel())
          .catch(async () => {
            // A failed cancellation cannot prove release. Keep the coordinator
            // busy until normal completion confirms it; never race a fallback.
            await session.completion.catch(() => undefined);
          });
        return stopping;
      }

      async function run(): Promise<VoiceOutcome> {
        const attempts: VoiceAttempt[] = [];
        let started = false;
        for (const provider of registry) {
          if (cancelled) return { status: "cancelled" };
          const record = (reason: VoiceAttempt["reason"]) => {
            attempts.push({ providerId: provider.id, engine: provider.engine, reason });
          };
          const authorization = authorizations.find(
            (grant) => grant.providerId === provider.id && grant.engine === provider.engine,
          );
          if (!authorization) {
            record("authorization-required");
            continue;
          }
          let capability: VoiceCapability | null;
          try {
            capability = await Promise.race([
              provider.getCapability("es-ES", controller.signal),
              cancellation,
            ]);
          } catch {
            if (cancelled) return { status: "cancelled" };
            record("capability-error");
            continue;
          }
          if (cancelled) return { status: "cancelled" };
          if (!capability || capability.locale !== "es-ES" || !capability.available || !capability.fileInput) {
            record("unsupported");
            continue;
          }
          if (provider.engine === "verified-local" && !hasLocalEvidence(capability)) {
            record("local-evidence-required");
            continue;
          }
          // A system recognizer is conservatively network-capable even when an
          // adapter reports an offline preference. External contracts may bill.
          const networkAllowed = provider.engine !== "verified-local";
          const costAllowed = provider.engine === "external" || capability.cost !== "none";
          if (networkAllowed && authorization.network !== "allow") {
            record("network-authorization-required");
            continue;
          }
          if (costAllowed && authorization.cost !== "allow") {
            record("cost-authorization-required");
            continue;
          }
          started = true;
          try {
            current = provider.start({
              locale: "es-ES",
              audioFileUri,
              signal: controller.signal,
              requiresOnDeviceRecognition: provider.engine === "verified-local",
              networkAllowed,
              costAllowed,
            });
            stopping = undefined;
          } catch {
            record("provider-error");
            continue;
          }
          const settled = current.completion.then(
            (transcript) => ({ transcript }),
            () => ({ transcript: null }),
          );
          const terminal = await Promise.race([settled, cancellation]);
          if (cancelled) {
            await stopCurrent();
            return { status: "cancelled" };
          }
          current = undefined; // completion confirms release before the next attempt
          if (!terminal?.transcript) {
            record("provider-error");
            continue;
          }
          const text = terminal.transcript.text;
          if (typeof text !== "string" || !text.trim()) {
            record("no-transcript");
            continue;
          }
          return { status: "completed", providerId: provider.id, engine: provider.engine, text: text.trim() };
        }
        return { status: started ? "failed" : "unavailable", attempts };
      }

      const result = run().finally(() => {
        finished = true;
        active = false;
      });
      return {
        result,
        cancel: async () => {
          if (finished) return;
          cancelled = true;
          controller.abort();
          notifyCancellation();
          await stopCurrent();
        },
      };
    },
  };
}
