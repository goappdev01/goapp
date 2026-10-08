import { useRef, useState } from "react";
import {
  emptyGoAction, emptyGoContext, normalizeBookingText, parseBookingRequest, emptyBookingRequest,
  assessTaskCreation, taskClock, stripGoAddress,
  type GoAction, type GoContext,
} from "@workspace/api-zod";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { useBookingAssistant } from "./useBookingAssistant";
import { localToday } from "@/lib/bookingAssistant";
import {
  interpretGoActions, personalActionMissing, savePersonalAction, findGoLists,
  describePersonalResult, type PersonalResult,
} from "@/lib/goPersonalActions";

type BookingAssistant = ReturnType<typeof useBookingAssistant>;
type Active = GoContext["active"];
export const GO_TASK_CREATION_ONLY = true;
type TaskReview = { action: GoAction; reason: string; times: string[] };
export function useGoActions(a: BookingAssistant) {
  const [active, setActiveState] = useState<Active>(null);
  const [result, setResult] = useState<PersonalResult | null>(null);
  const [choices, setChoices] = useState<GoEntry[]>([]);
  const [review, setReviewState] = useState<TaskReview | null>(null);
  const reviewRef = useRef<TaskReview | null>(null);
  const unresolved = useRef({ date: false, time: false, times: [] as string[] });
  const setReview = (value: TaskReview | null) => { reviewRef.current = value; setReviewState(value); };
  const current = useRef<Active>(null);
  const pending = useRef<GoAction | null>(null);
  const remainder = useRef<GoAction[]>([]);
  const list = useRef<{ id: string; title: string } | null>(null);
  const dispatchLock = useRef(false);
  const setActive = (value: Active) => { current.current = value; setActiveState(value); };
  function reset() {
    setReview(null);
    unresolved.current = { date: false, time: false, times: [] };
    pending.current = null;
    remainder.current = [];
    list.current = null;
    setResult(null);
    setChoices([]);
    setActive(null);
  }
  function start(kind: NonNullable<Active>) {
    if (a.lock.current) return;
    if (GO_TASK_CREATION_ONLY && kind !== "task" && kind !== "event" && kind !== "booking") {
      a.setNotice("Ahora puedes crear tareas y actividades o buscar reservas.");
      return;
    }
    setReview(null);
    unresolved.current = { date: false, time: false, times: [] };
    a.setPanel(null);
    setChoices([]);
    setResult(null);
    setActive(kind);
    if (kind === "booking") {
      a.changeField("serviceQuery", "¿Qué quieres reservar?");
      return;
    }
    pending.current = { ...emptyGoAction("Nueva acción", kind), listOperation: kind === "list" ? "create" : null };
    a.say(kind === "task" ? "¿Qué tarea quieres apuntar? La fecha y la hora son opcionales."
      : kind === "event" ? "¿Qué actividad quieres añadir y qué día es?"
      : "¿Cómo se llama la lista? También puedes decir sus elementos.");
  }
  function resumeBooking() {
    a.setPanel(null);
    setActive("booking");
  }
  async function showLists() {
    if (GO_TASK_CREATION_ONLY) { a.setNotice("Las listas siguen pendientes de activar."); return; }
    a.setPanel(null);
    setActive("list");
    await a.work("Consultando notas…", async token => {
      const notes = await findGoLists();
      a.check(token);
      pending.current = null;
      setChoices(notes);
      if (!notes.length) a.say("No hay listas en tus notas. Puedes crear una indicando su nombre y sus elementos.");
      else a.say("Elige la lista que quieres abrir.");
    });
  }
  function context(): GoContext {
    return {
      ...emptyGoContext(), active: current.current, pending: pending.current,
      listTitle: list.current?.title || null,
      bookingDate: a.created?.startDatetime.slice(0, 10) || a.request.date,
      bookingTime: a.created?.startDatetime.slice(11, 16) || a.request.timeFrom,
    };
  }
  async function saveCreation(action: GoAction, token: number) {
    a.check(token);
    a.setBusy("Guardando en GO…");
    const saved = await savePersonalAction(action);
    a.check(token);
    pending.current = null;
    unresolved.current = { date: false, time: false, times: [] };
    setReview(null);
    setResult(saved);
    a.say(describePersonalResult(saved));
  }
  async function confirmTask(time?: string) {
    const draft = reviewRef.current;
    if (!draft || a.lock.current || dispatchLock.current) return;
    if (draft.times.length && (!time || !draft.times.includes(time))) {
      a.say("Elige una de las horas del resumen o dímela con mañana/tarde.");
      return;
    }
    dispatchLock.current = true;
    try {
      await a.work("Guardando en GO…", token =>
        saveCreation({ ...draft.action, ...(time ? { time } : {}) }, token));
    } finally { dispatchLock.current = false; }
  }
  async function execute(action: GoAction, token: number, listId?: string): Promise<boolean> {
    a.check(token);
    if (GO_TASK_CREATION_ONLY && (action.operation !== "create" || !["task", "event"].includes(action.kind))) {
      a.say("Ahora puedo crear tareas o actividades. Consultar, editar, eliminar, notas y listas siguen pendientes; no he cambiado tus datos.");
      return true;
    }
    if (action.kind === "task" || action.kind === "event") {
      const continuing = pending.current?.kind === action.kind && (!pending.current.title || pending.current.title === action.title);
      if (!continuing) unresolved.current = { date: false, time: false, times: [] };
      const assessment = assessTaskCreation(action);
      const next = assessment.action;
      const clock = taskClock(next.source);
      const noTime = /\bsin hora\b/.test(normalizeBookingText(next.source));
      if (clock.matched || clock.invalid || noTime) unresolved.current.times = assessment.times;
      if (next.date) unresolved.current.date = false;
      if (clock.time || assessment.times.length || noTime) unresolved.current.time = false;
      if (assessment.question) {
        if (assessment.question.includes("fecha")) unresolved.current.date = true;
        else unresolved.current.time = true;
      }
      pending.current = next;
      setActive(next.kind as Active);
      setChoices([]);
      setReview(null);
      const missing = personalActionMissing(next);
      const question = missing || assessment.question
        || (unresolved.current.date ? "¿Qué fecha válida quieres asignarle?" : null)
        || (unresolved.current.time ? "¿A qué hora? Puedes indicar 17:30 o decir «sin hora»." : null);
      if (question) { a.say(question); return false; }
      const times = unresolved.current.times;
      const reason = times.length ? "Elige la hora correcta antes de guardar." : assessment.reason;
      if (reason) {
        setReview({ action: next, reason, times });
        a.say("Revisa el título, día y hora del resumen antes de guardar.");
        return false;
      }
      await saveCreation(next, token);
      return true;
    }
    // Preserve the existing list draft, outside this step's enabled capabilities.
    const missing = personalActionMissing(action);
    setActive(action.kind as Active);
    setChoices([]);
    if (missing) { pending.current = action; a.say(missing); return false; }
    if (action.kind === "list" && !listId) {
      const matches = await findGoLists(action.title);
      a.check(token);
      if (matches.length > 1) {
        pending.current = action; setChoices(matches);
        a.say("Hay varias listas con ese nombre. Elige la que quieres utilizar.");
        return false;
      }
      if (matches.length === 1) listId = matches[0].id;
    }
    a.setBusy("Guardando en GO…");
    const saved = await savePersonalAction(action, listId);
    a.check(token);
    pending.current = null;
    setResult(saved);
    if (saved.kind === "list") list.current = { id: saved.entry.id, title: saved.entry.notes || action.title! };
    a.say(describePersonalResult(saved, action.listOperation));
    return true;
  }
  async function chooseList(entry: GoEntry) {
    if (GO_TASK_CREATION_ONLY) return;
    if (dispatchLock.current || a.lock.current) return;
    dispatchLock.current = true;
    try {
      await a.work("Consultando lista…", async token => {
        const action = pending.current?.kind === "list" ? pending.current
          : { ...emptyGoAction("Consultar lista", "list"), title: entry.notes || "Lista", listOperation: "read" as const };
        await execute({ ...action, title: entry.notes || action.title }, token, entry.id);
      });
    } finally { dispatchLock.current = false; }
  }
  async function dispatch(text: string, useAI: boolean) {
    if (!text.trim() || dispatchLock.current || a.lock.current) return;
    const n = normalizeBookingText(stripGoAddress(text));
    if (reviewRef.current && /^(?:si|confirmar|confirmo|guardar|correcto)$/.test(n)) {
      a.say(text.trim(), "user");
      await confirmTask();
      return;
    }
    dispatchLock.current = true;
    a.setPanel(null);
    a.say(text.trim(), "user");
    if (/^(?:nueva conversacion|cancelar accion|cancelar|olvida eso)$/.test(n)) {
      reset();
      a.say("Acción pendiente descartada. Tus datos guardados se conservan.");
      dispatchLock.current = false;
      return;
    }
    if (/^(?:mis reservas|ver mis reservas|volver a (?:la )?reserva|continuar reserva)$/.test(n)) {
      resumeBooking();
      if (n.includes("mis reservas")) await a.showBookings();
      dispatchLock.current = false;
      return;
    }
    let bookings: GoAction[] = [];
    let tokenAtStart: number | null = null;
    try {
      await a.work("Entendiendo tu solicitud…", async token => {
        tokenAtStart = token;
        const ctx = context();
        const plan = pending.current && /^sin hora$/.test(n)
          ? { actions: [{ ...pending.current, source: "sin hora", time: null }] }
          : await interpretGoActions(text, ctx, useAI);
        a.check(token);
        const queued = pending.current && plan.actions.some(item => item.kind === pending.current?.kind)
          ? remainder.current.splice(0) : [];
        const actions = [...plan.actions, ...queued];
        // The date anchor is extracted from this message only; no calendar/list inventory goes to AI.
        const bookingPart = actions.find(item => item.kind === "booking");
        const date = bookingPart ? parseBookingRequest(bookingPart.source, emptyBookingRequest(), localToday()).date : ctx.bookingDate;
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          if (action.kind === "booking" || action.kind === "followup") {
            bookings.push(action);
            continue;
          }
          if (action.kind === "unknown") {
            a.say("Puedo ayudarte a buscar reservas y crear una tarea o actividad. Dime qué quieres hacer; no he cambiado tus datos.");
            continue;
          }
          if ((action.beforeBooking || /\bantes\b/.test(normalizeBookingText(action.source))) && date && !action.date) {
            action.detail = [action.detail, "Antes de la reserva del " + date.split("-").reverse().join("/") +
              (!bookingPart && ctx.bookingTime ? " a las " + ctx.bookingTime : "")].filter(Boolean).join("\n").slice(0, 2000);
          }
          if (!await execute(action, token)) {
            remainder.current = actions.slice(i + 1);
            break;
          }
        }
      });
      if (tokenAtStart !== null) a.check(tokenAtStart);
      // Keep the booking state machine and its explicit confirmation boundary.
      for (const action of bookings) {
        setActive("booking");
        await a.send(action.source, useAI, false);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== "REQUEST_CANCELLED") a.setNotice(error.message);
    } finally { dispatchLock.current = false; }
  }
  return { active, result, choices, pending, review, confirmTask, reset, start, resumeBooking, showLists, chooseList, dispatch };
}
