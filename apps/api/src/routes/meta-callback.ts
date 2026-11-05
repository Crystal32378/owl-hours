// Public Facebook Login callback (Meta app > Facebook Login > Valid OAuth
// Redirect URIs: <API_PUBLIC_URL>/v1/meta/callback). It has no owner session:
// the signed state says which business and owner started the link. It always
// answers a redirect to the owner web app, never a token.
import { Hono } from "hono";
import { finishMetaLink, type MetaLinkDeps } from "../services/owner-meta.ts";

export function metaCallbackRoutes(deps: MetaLinkDeps): Hono {
  const app = new Hono();
  app.get("/callback", async (c) => c.redirect(await finishMetaLink(deps, c.req.query()), 302));
  return app;
}
