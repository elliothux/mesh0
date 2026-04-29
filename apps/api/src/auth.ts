import type { User as DbUser } from "@mesh0/db/types";
import { ORPCError } from "@orpc/server";
import type { User as WorkOSUser } from "@workos-inc/node/worker";
import { WorkOS } from "@workos-inc/node/worker";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { AppEnv } from "./env";

const API_ORIGIN = "https://api.mesh0.run";
const BEARER_PREFIX = "Bearer ";

const accessTokenClaimsSchema = z.looseObject({
  sub: z.string().min(1),
  sid: z.string().min(1),
  org_id: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  entitlements: z.array(z.string()).optional(),
  exp: z.number().int(),
  iat: z.number().int(),
});

export type WorkOSAuth = {
  getAuthorizationUrl(input: {
    redirectUri: string;
    state: string | undefined;
  }): string;
  authenticateWithCode(input: {
    code: string;
    ipAddress: string | undefined;
    userAgent: string | undefined;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    user: WorkOSUser;
  }>;
  authenticateRequest(request: Request): Promise<AuthenticatedRequest>;
};

export type AuthenticatedRequest = {
  sessionId: string;
  userId: string;
};

export function createWorkOSAuth(env: AppEnv): WorkOSAuth {
  const workos = new WorkOS(env.WORKOS_API_KEY, {
    clientId: env.WORKOS_CLIENT_ID,
  });
  const jwks = createRemoteJWKSet(
    new URL(workos.userManagement.getJwksUrl(env.WORKOS_CLIENT_ID)),
  );

  return {
    authenticateRequest: (request) => authenticateRequest(request, jwks),
    authenticateWithCode: async ({ code, ipAddress, userAgent }) =>
      workos.userManagement.authenticateWithCode({
        clientId: env.WORKOS_CLIENT_ID,
        code,
        ipAddress,
        userAgent,
      }),
    getAuthorizationUrl: ({ redirectUri, state }) =>
      workos.userManagement.getAuthorizationUrl({
        clientId: env.WORKOS_CLIENT_ID,
        provider: "authkit",
        redirectUri,
        state,
      }),
  };
}

export function defaultRedirectUri(request: Request) {
  const url = new URL(request.url);
  const origin =
    url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? url.origin
      : API_ORIGIN;

  return `${origin}/auth/callback`;
}

export function mapWorkOSUser(user: WorkOSUser) {
  return {
    createdAt: user.createdAt,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    id: user.id,
    lastName: user.lastName,
    lastSignInAt: user.lastSignInAt,
    profilePictureUrl: user.profilePictureUrl,
    updatedAt: user.updatedAt,
  };
}

export function serializeUser(user: DbUser) {
  return {
    createdAt: user.createdAt,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    id: user.id,
    lastName: user.lastName,
    lastSignInAt: user.lastSignInAt,
    profilePictureUrl: user.profilePictureUrl,
    updatedAt: user.updatedAt,
  };
}

async function authenticateRequest(
  request: Request,
  jwks: ReturnType<typeof createRemoteJWKSet>,
): Promise<AuthenticatedRequest> {
  const authorization = request.headers.get("Authorization");
  if (authorization === null || !authorization.startsWith(BEARER_PREFIX)) {
    throw new ORPCError("UNAUTHORIZED", { message: "Missing bearer token" });
  }

  const accessToken = authorization.slice(BEARER_PREFIX.length);
  const claims = await verifyAccessToken(accessToken, jwks);

  return {
    sessionId: claims.sid,
    userId: claims.sub,
  };
}

async function verifyAccessToken(
  accessToken: string,
  jwks: ReturnType<typeof createRemoteJWKSet>,
) {
  try {
    const { payload } = await jwtVerify(accessToken, jwks, {
      issuer: ["https://api.workos.com", "https://api.workos.com/"],
    });

    return accessTokenClaimsSchema.parse(payload);
  } catch (error) {
    throw new ORPCError("UNAUTHORIZED", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
