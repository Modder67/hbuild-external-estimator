import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meshRouter from "./mesh";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meshRouter);

export default router;
