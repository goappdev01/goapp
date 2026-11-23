export type GoAiActivity = "available" | "entry" | "listening" | "processing" | "speaking" | "executing" | "completed" | "error" | "closing";
export type GoAiExpression = "friendly" | "wink" | "informative" | "serious" | "attention" | "confirmation" | "positive";

/** A visual state must follow an observable operation, never the contents of a private message. */
export function assistantActivity(input: {
  voice: "idle" | "preparing" | "listening" | "transcribing";
  busy?: string | boolean;
  speaking?: boolean;
  completed?: boolean;
  error?: boolean;
}): GoAiActivity {
  if (input.error) return "error";
  if (input.voice === "listening") return "listening";
  if (input.voice === "preparing") return "entry";
  if (input.voice === "transcribing") return "processing";
  if (input.speaking) return "speaking";
  if (input.busy) return typeof input.busy === "string" && /^(Guardando|Confirmando|Cancelando)/.test(input.busy) ? "executing" : "processing";
  if (input.completed) return "completed";
  return "available";
}

export function visibleExpression(activity: GoAiActivity, requested: GoAiExpression): GoAiExpression {
  if (activity === "available" || activity === "closing") return "friendly";
  if (requested === "serious") return "serious";
  if (activity === "error") return "attention";
  if (activity === "completed") return "positive";
  return requested;
}

export const goAiActivityIsAnimated = (activity: GoAiActivity) =>
  activity === "listening" || activity === "processing" || activity === "speaking" || activity === "executing";
