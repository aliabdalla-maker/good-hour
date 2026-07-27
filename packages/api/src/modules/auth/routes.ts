import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { registerSchema, loginSchema, userPublicSchema } from "@gihtcx/shared";
import { config } from "../../config";
import { getUserById, loginUser, registerUser, toPublicUser } from "./service";

// web and api are deployed on different Railway subdomains (different sites,
// not just different origins) -- a browser never attaches a SameSite=Lax
// cookie to a cross-site fetch, so every "authenticated" request would 401
// regardless of a successful login. "none" (which requires Secure) is the
// correct setting once the two are genuinely cross-site; "lax" is kept for
// local dev, where web/api share the same site (just different ports).
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: (config.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  secure: config.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export default async function authRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/register",
    { schema: { body: registerSchema, response: { 201: userPublicSchema } } },
    async (request, reply) => {
      const { user, token } = await registerUser(request.body);
      reply.setCookie(config.COOKIE_NAME, token, COOKIE_OPTS);
      return reply.status(201).send(toPublicUser(user));
    }
  );

  server.post(
    "/login",
    {
      // Stricter throttle than the global limit to blunt credential brute-force.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: loginSchema, response: { 200: userPublicSchema } },
    },
    async (request, reply) => {
      const { user, token } = await loginUser(request.body);
      reply.setCookie(config.COOKIE_NAME, token, COOKIE_OPTS);
      return reply.send(toPublicUser(user));
    }
  );

  server.post("/logout", async (_request, reply) => {
    // Must match the sameSite/secure attributes the cookie was set with, or
    // the browser won't recognise this as clearing the same cookie.
    reply.clearCookie(config.COOKIE_NAME, { path: "/", sameSite: COOKIE_OPTS.sameSite, secure: COOKIE_OPTS.secure });
    return reply.status(204).send();
  });

  server.get(
    "/me",
    {
      preHandler: [app.authenticate],
      schema: { response: { 200: userPublicSchema } },
    },
    async (request, reply) => {
      const user = await getUserById(request.currentUser!.sub);
      return reply.send(toPublicUser(user));
    }
  );
}
