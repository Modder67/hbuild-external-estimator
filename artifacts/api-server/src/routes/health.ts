import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Database reachability probe: runs `select 1` on the configured database.
 * Exposes no data — only whether the connection string actually connects —
 * so a bad DATABASE_URL is visible without a signed-in staff request.
 */
router.get("/healthz/db", async (req, res): Promise<void> => {
  try {
    await pool.query("select 1");
    res.json({ database: "ok" });
  } catch (error) {
    req.log.warn({ error }, "Database health check failed");
    const cause = (error as { code?: string; hostname?: string })
      ?? {};
    const deep = (error as { cause?: { code?: string; hostname?: string } }).cause ?? cause;
    res.status(503).json({
      database: "unreachable",
      code: deep.code ?? cause.code ?? null,
      host: deep.hostname ?? null,
    });
  }
});

export default router;
