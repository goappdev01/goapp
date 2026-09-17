import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supabaseRouter from "./supabase";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/supabase", supabaseRouter);

export default router;
