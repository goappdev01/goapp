import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error?.type === "entity.parse.failed" ? 400 : 502;
  res.status(status).json({ error: status === 400 ? "Invalid JSON" : "No se pudo conectar con el servicio. Intenta de nuevo." });
};
app.use(handleError);

export default app;
