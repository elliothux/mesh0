import type { User as DbUser } from "@mesh0/db/types";
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
} from "@mesh0/sdk/auth";
import { ORPCError } from "@orpc/server";
import type { User as WorkOSUser } from "@workos-inc/node/worker";
import { WorkOS } from "@workos-inc/node/worker";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { AppEnv } from "./env";
import {
  defaultWebUrl,
  getBearerToken,
  isAllowedWebUrl,
  isLocalHost,
} from "./http";

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
  authenticateWithRefreshToken(input: {
    ipAddress: string | undefined;
    refreshToken: string;
    userAgent: string | undefined;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    user: WorkOSUser;
  }>;
  authenticateRequest(request: Request): Promise<AuthenticatedRequest>;
  revokeSession(input: { sessionId: string }): Promise<void>;
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
    authenticateWithRefreshToken: async ({
      ipAddress,
      refreshToken,
      userAgent,
    }) =>
      workos.userManagement.authenticateWithRefreshToken({
        clientId: env.WORKOS_CLIENT_ID,
        ipAddress,
        refreshToken,
        userAgent,
      }),
    getAuthorizationUrl: ({ redirectUri, state }) =>
      workos.userManagement.getAuthorizationUrl({
        clientId: env.WORKOS_CLIENT_ID,
        provider: "authkit",
        redirectUri,
        state,
      }),
    revokeSession: ({ sessionId }) =>
      workos.userManagement.revokeSession({ sessionId }),
  };
}

export function defaultRedirectUri(request: Request) {
  return new URL("/auth/callback", request.url).toString();
}

export function resolveAuthRedirectUrl({
  env,
  next,
  request,
}: {
  env: AppEnv;
  next: string | null | undefined;
  request: Request;
}) {
  const fallbackUrl = defaultWebUrl(env, request, "/dashboard");
  if (next === null || next === undefined || next === "") {
    return fallbackUrl;
  }

  try {
    const redirectUrl = new URL(next, fallbackUrl);
    return isAllowedWebUrl(env, request, redirectUrl) ? redirectUrl : null;
  } catch {
    return null;
  }
}

export function appendAuthCookies({
  env,
  headers,
  request,
  tokens,
}: {
  env: AppEnv;
  headers: Headers;
  request: Request;
  tokens: { accessToken: string; refreshToken: string };
}) {
  const requestUrl = new URL(request.url);
  const isLocalRequest = isLocalHost(requestUrl.hostname);
  const domain = isLocalRequest ? undefined : `.${env.APP_DOMAIN}`;
  const secure = requestUrl.protocol === "https:" || !isLocalRequest;

  headers.append(
    "Set-Cookie",
    serializeCookie(AUTH_ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      domain,
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
      secure,
    }),
  );
  headers.append(
    "Set-Cookie",
    serializeCookie(AUTH_REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      domain,
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
      secure,
    }),
  );
}

export function expireAuthCookies({
  env,
  headers,
  request,
}: {
  env: AppEnv;
  headers: Headers;
  request: Request;
}) {
  const requestUrl = new URL(request.url);
  const isLocalRequest = isLocalHost(requestUrl.hostname);
  const domain = isLocalRequest ? undefined : `.${env.APP_DOMAIN}`;
  const secure = requestUrl.protocol === "https:" || !isLocalRequest;

  headers.append(
    "Set-Cookie",
    serializeCookie(AUTH_ACCESS_TOKEN_COOKIE, "", {
      domain,
      maxAge: 0,
      secure,
    }),
  );
  headers.append(
    "Set-Cookie",
    serializeCookie(AUTH_REFRESH_TOKEN_COOKIE, "", {
      domain,
      maxAge: 0,
      secure,
    }),
  );
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
  const accessToken =
    getBearerToken(request) ??
    getCookieValue(request, AUTH_ACCESS_TOKEN_COOKIE);
  if (accessToken === undefined) {
    throw new ORPCError("UNAUTHORIZED", { message: "Missing access token" });
  }

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
    const { payload } = await jwtVerify(accessToken, jwks);

    return accessTokenClaimsSchema.parse(payload);
  } catch (error) {
    throw new ORPCError("UNAUTHORIZED", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function serializeCookie(
  name: string,
  value: string,
  options: { domain: string | undefined; maxAge: number; secure: boolean },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (options.domain !== undefined) {
    parts.push(`Domain=${options.domain}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader === null) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch (error) {
        throw new ORPCError("UNAUTHORIZED", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return undefined;
}
