import type { AppEnv } from "./env";

const BEARER_PREFIX = "Bearer ";

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");
  return authorization?.startsWith(BEARER_PREFIX)
    ? authorization.slice(BEARER_PREFIX.length)
    : undefined;
}

export function defaultWebUrl(env: AppEnv, request: Request, path: string) {
  const requestUrl = new URL(request.url);
  if (isLocalHost(requestUrl.hostname)) {
    return new URL(path, requestUrl.origin);
  }

  return new URL(path, `https://${env.APP_DOMAIN}`);
}

export function isAllowedWebUrl(env: AppEnv, request: Request, url: URL) {
  const requestUrl = new URL(request.url);
  if (isLocalHost(requestUrl.hostname)) {
    return (
      isLocalHost(url.hostname) &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  }

  return (
    url.protocol === "https:" &&
    (url.hostname === env.APP_DOMAIN ||
      url.hostname === `www.${env.APP_DOMAIN}`)
  );
}

export function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
