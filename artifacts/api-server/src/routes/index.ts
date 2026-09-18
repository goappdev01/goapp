import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supabaseRouter from "./supabase";

import managementRouter from "./management";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/supabase/manage", managementRouter);
router.use("/supabase", supabaseRouter);

export default router;
