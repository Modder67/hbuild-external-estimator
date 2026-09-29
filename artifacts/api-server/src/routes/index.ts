import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meshRouter from "./mesh";
import estimatesRouter from "./estimates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meshRouter);
router.use(estimatesRouter);

export default router;
