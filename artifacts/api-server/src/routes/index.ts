import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bookingAssistantRouter from "./booking-assistant";
import supabaseRouter from "./supabase";
import bookingVerificationRouter from "./bookingVerification";
import bookingNegotiationRouter from "./bookingNegotiation";
import bookingTimelineRouter from "./bookingTimeline";
import bookingCalendarRouter from "./bookingCalendar";
import catalogAssociationsRouter from "./catalogAssociations";
import modulePublicationRouter from "./modulePublication";

import managementRouter from "./management";
import adminRouter from "./admin";
import boardsRouter from "./boards";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/supabase/admin", adminRouter);
router.use("/supabase/boards", boardsRouter);
router.use("/booking-assistant", bookingAssistantRouter);
router.use("/supabase/manage", managementRouter);
router.use("/supabase", modulePublicationRouter);
router.use("/supabase", bookingVerificationRouter);
router.use("/supabase", bookingTimelineRouter);
router.use("/supabase", bookingCalendarRouter);
router.use("/supabase", catalogAssociationsRouter);
router.use("/supabase", bookingNegotiationRouter);
router.use("/supabase", supabaseRouter);

export default router;
