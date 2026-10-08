import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supabaseRouter from "./supabase";

import managementRouter from "./management";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/supabase/admin", adminRouter);
router.use("/supabase/manage", managementRouter);
router.use("/supabase", supabaseRouter);

export default router;
