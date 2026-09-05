import { S3Storage } from "@mesh0/adapters/storage/s3";
import { describe, expect, test } from "bun:test";

describe("S3Storage", () => {
  test("puts objects with path-style SigV4 headers", async () => {
    const requests: CapturedRequest[] = [];
    const storage = new S3Storage({
      accessKeyId: "AKIA_TEST",
      bucket: "mesh0-runs",
      endpoint: "https://s3.example.com/root",
      fetch: captureFetch(requests, new Response(null, { status: 200 })),
      now: () => new Date("2026-05-04T12:34:56Z"),
      region: "us-east-1",
      secretAccessKey: "secret",
    });

    const object = await storage.put({
      body: "hello",
      contentType: "text/plain",
      path: "output/log.txt",
      runId: "run_test",
    });

    expect(object).toEqual({
      contentType: "text/plain",
      key: "runs/run_test/output/log.txt",
      path: "output/log.txt",
      runId: "run_test",
    });
    expect(requests[0]?.url).toBe(
      "https://s3.example.com/root/mesh0-runs/runs/run_test/output/log.txt",
    );
    expect(requests[0]?.method).toBe("PUT");
    expect(requests[0]?.headers.get("x-amz-date")).toBe("20260504T123456Z");
    expect(requests[0]?.headers.get("x-amz-content-sha256")).toBe(
      "UNSIGNED-PAYLOAD",
    );
    expect(requests[0]?.headers.get("authorization")).toStartWith(
      "AWS4-HMAC-SHA256 Credential=AKIA_TEST/20260504/us-east-1/s3/aws4_request",
    );
  });

  test("gets byte ranges and returns undefined for missing objects", async () => {
    const requests: CapturedRequest[] = [];
    const storage = new S3Storage({
      accessKeyId: "AKIA_TEST",
      bucket: "mesh0-runs",
      endpoint: "https://s3.example.com",
      fetch: captureFetch(
        requests,
        new Response("hello", {
          headers: { "Content-Type": "text/plain" },
          status: 206,
        }),
        new Response(null, { status: 404 }),
      ),
      now: () => new Date("2026-05-04T12:34:56Z"),
      region: "us-east-1",
      secretAccessKey: "secret",
    });

    const object = await storage.getRange({
      length: 3,
      offset: 2,
      path: "workspace/file.txt",
      runId: "run_test",
    });
    const missing = await storage.get({
      path: "missing.txt",
      runId: "run_test",
    });

    expect(object?.contentType).toBe("text/plain");
    if (object === undefined) {
      throw new Error("Expected ranged S3 object");
    }
    expect(await new Response(object.body).text()).toBe("hello");
    expect(missing).toBeUndefined();
    expect(requests[0]?.headers.get("range")).toBe("bytes=2-4");
    expect(requests[1]?.method).toBe("GET");
  });
});

type CapturedRequest = {
  headers: Headers;
  method: string;
  url: string;
};

function captureFetch(
  requests: CapturedRequest[],
  ...responses: Response[]
): typeof fetch {
  return async (input, init) => {
    requests.push({
      headers: new Headers(init?.headers),
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Missing captured response");
    }

    return response;
  };
}
