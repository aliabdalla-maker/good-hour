import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "APP_ERROR"
  ) {
    super(message);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        issues: error.flatten(),
      });
    }

    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: (error as Error).message });
    }

    // Framework errors that carry their own 4xx status (rate limit 429,
    // payload-too-large 413, etc.) must keep it rather than becoming a 500.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      const code = (error as { code?: string }).code ?? "REQUEST_ERROR";
      return reply.status(statusCode).send({ error: code, message: (error as Error).message });
    }

    app.log.error(error);
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Something went wrong" });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: "NOT_FOUND", message: "Route not found" });
  });
}
