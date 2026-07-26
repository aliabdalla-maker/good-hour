import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createReviewSchema, reviewPublicSchema } from "@gihtcx/shared";
import { createReview, listReviewsForRoom } from "./service";

export default async function reviewsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Traveller posts a verified review for one of their confirmed bookings.
  server.post(
    "/",
    {
      preHandler: [app.authenticate, app.requireRole(["TRAVELLER", "ADMIN"])],
      schema: { body: createReviewSchema, response: { 201: reviewPublicSchema } },
    },
    async (request, reply) => {
      const review = await createReview(request.currentUser!.sub, request.body);
      return reply.status(201).send(review);
    }
  );

  // Public list of reviews for a room/unit.
  server.get(
    "/",
    {
      schema: {
        querystring: z.object({ roomId: z.string() }),
        response: { 200: z.array(reviewPublicSchema) },
      },
    },
    async (request, reply) => {
      return reply.send(await listReviewsForRoom(request.query.roomId));
    }
  );
}
