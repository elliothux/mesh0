import { normalizeRunStoragePath } from "@mesh0/sdk/artifacts";
import type {
  RunStorage,
  RunStorageGet,
  RunStorageGetRange,
  RunStorageObject,
  RunStoragePut,
  StoredRunObject,
} from "../index";
import { buildRunStorageKey } from "../utils";

type S3Fetch = typeof fetch;

export type S3StorageOptions = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  fetch?: S3Fetch;
  forcePathStyle?: boolean;
  now?: () => Date;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type SignedRequest = {
  headers: Headers;
  url: URL;
};

const service = "s3";
const unsignedPayload = "UNSIGNED-PAYLOAD";
const contentTypeHeader = "content-type";
const hostHeader = "host";
const rangeHeader = "range";
const securityTokenHeader = "x-amz-security-token";
const sha256Header = "x-amz-content-sha256";
const timestampHeader = "x-amz-date";

export class S3Storage implements RunStorage {
  readonly #accessKeyId: string;
  readonly #bucket: string;
  readonly #endpoint: URL;
  readonly #fetch: S3Fetch;
  readonly #forcePathStyle: boolean;
  readonly #now: () => Date;
  readonly #region: string;
  readonly #secretAccessKey: string;
  readonly #sessionToken: string | undefined;

  constructor({
    accessKeyId,
    bucket,
    endpoint,
    fetch: fetchInput,
    forcePathStyle = true,
    now,
    region,
    secretAccessKey,
    sessionToken,
  }: S3StorageOptions) {
    this.#accessKeyId = accessKeyId;
    this.#bucket = bucket;
    this.#endpoint = new URL(endpoint);
    this.#fetch = fetchInput ?? fetch;
    this.#forcePathStyle = forcePathStyle;
    this.#now = now ?? (() => new Date());
    this.#region = region;
    this.#secretAccessKey = secretAccessKey;
    this.#sessionToken = sessionToken;
  }

  async put({
    body,
    contentType,
    path,
    runId,
  }: RunStoragePut): Promise<StoredRunObject> {
    const normalizedPath = normalizeRunStoragePath(path);
    const key = buildRunStorageKey({ path: normalizedPath, runId });
    const headers = new Headers();
    if (contentType !== undefined) {
      headers.set(contentTypeHeader, contentType);
    }

    const request = await this.#sign({
      headers,
      key,
      method: "PUT",
    });
    const response = await this.#fetch(request.url, {
      body,
      headers: request.headers,
      method: "PUT",
    });
    await requireOk(response, `S3 put failed for ${key}`);

    return {
      contentType,
      key,
      path: normalizedPath,
      runId,
    };
  }

  async get(input: RunStorageGet): Promise<RunStorageObject | undefined> {
    return this.#getObject(input);
  }

  async getRange({
    length,
    offset,
    path,
    runId,
  }: RunStorageGetRange): Promise<RunStorageObject | undefined> {
    return this.#getObject({
      headers: new Headers({
        [rangeHeader]: `bytes=${offset}-${offset + length - 1}`,
      }),
      path,
      runId,
    });
  }

  async #getObject({
    headers = new Headers(),
    path,
    runId,
  }: RunStorageGet & { headers?: Headers }): Promise<
    RunStorageObject | undefined
  > {
    const normalizedPath = normalizeRunStoragePath(path);
    const key = buildRunStorageKey({ path: normalizedPath, runId });
    const request = await this.#sign({
      headers,
      key,
      method: "GET",
    });
    const response = await this.#fetch(request.url, {
      headers: request.headers,
      method: "GET",
    });
    if (response.status === 404) {
      return undefined;
    }
    await requireOk(response, `S3 get failed for ${key}`);

    if (response.body === null) {
      throw new Error(`S3 get returned no body for ${key}`);
    }

    return {
      body: response.body,
      contentType: response.headers.get("Content-Type") ?? undefined,
      key,
      path: normalizedPath,
      runId,
    };
  }

  async #sign({
    headers,
    key,
    method,
  }: {
    headers: Headers;
    key: string;
    method: "GET" | "PUT";
  }): Promise<SignedRequest> {
    const now = this.#now();
    const timestamp = formatTimestamp(now);
    const datestamp = timestamp.slice(0, 8);
    const url = this.#objectUrl(key);
    headers.set(hostHeader, url.host);
    headers.set(sha256Header, unsignedPayload);
    headers.set(timestampHeader, timestamp);
    if (this.#sessionToken !== undefined) {
      headers.set(securityTokenHeader, this.#sessionToken);
    }

    const canonicalHeaders = buildCanonicalHeaders(headers);
    const signedHeaders = canonicalHeaders.map(([name]) => name).join(";");
    const credentialScope = [
      datestamp,
      this.#region,
      service,
      "aws4_request",
    ].join("/");
    const canonicalRequest = [
      method,
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders
        .map(([name, value]) => `${name}:${normalizeHeaderValue(value)}\n`)
        .join(""),
      signedHeaders,
      unsignedPayload,
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timestamp,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = await buildSigningKey({
      datestamp,
      region: this.#region,
      secretAccessKey: this.#secretAccessKey,
    });
    const signature = await hmacHex(signingKey, stringToSign);

    headers.set(
      "Authorization",
      [
        `AWS4-HMAC-SHA256 Credential=${this.#accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(", "),
    );

    return { headers, url };
  }

  #objectUrl(key: string) {
    const url = new URL(this.#endpoint);
    if (this.#forcePathStyle) {
      url.pathname = joinUrlPath(url.pathname, this.#bucket, key);
      return url;
    }

    url.hostname = `${this.#bucket}.${url.hostname}`;
    url.pathname = joinUrlPath(url.pathname, key);
    return url;
  }
}

async function requireOk(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status} ${await response.text()}`);
  }
}

function joinUrlPath(...parts: string[]) {
  const path = parts
    .flatMap((part) => part.split("/"))
    .filter((part) => part.length > 0)
    .map(encodeURIComponent)
    .join("/");
  return `/${path}`;
}

function buildCanonicalHeaders(headers: Headers) {
  return [...headers.entries()]
    .map(([name, value]): readonly [string, string] => [
      name.toLowerCase(),
      value,
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

function normalizeHeaderValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatTimestamp(date: Date) {
  return `${date.toISOString().replaceAll("-", "").replaceAll(":", "").slice(0, 15)}Z`;
}

async function sha256Hex(value: string) {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function buildSigningKey({
  datestamp,
  region,
  secretAccessKey,
}: {
  datestamp: string;
  region: string;
  secretAccessKey: string;
}) {
  const dateKey = await hmacBytes(
    new TextEncoder().encode(`AWS4${secretAccessKey}`),
    datestamp,
  );
  const regionKey = await hmacBytes(dateKey, region);
  const serviceKey = await hmacBytes(regionKey, service);
  return hmacBytes(serviceKey, "aws4_request");
}

async function hmacHex(keyBytes: Uint8Array, value: string) {
  return bytesToHex(await hmacBytes(keyBytes, value));
}

async function hmacBytes(keyBytes: Uint8Array, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

function bytesToHex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
