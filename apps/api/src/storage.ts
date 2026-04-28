import { parseRunStoragePathname } from "@mesh0/sdk/artifacts";
import { RunNotFoundError } from "@mesh0/services/run";
import type { Context } from "./context";

export async function handleRunStorageRequest(
  request: Request,
  context: Context,
) {
  const input = parseRunStoragePathname(new URL(request.url).pathname);
  if (input === undefined) {
    return undefined;
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    await context.services.run.get({ runId: input.runId });
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return new Response("Not Found", { status: 404 });
    }

    throw error;
  }

  const object = await context.storage.get(input);
  if (object === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType ?? "application/octet-stream",
    },
  });
}
