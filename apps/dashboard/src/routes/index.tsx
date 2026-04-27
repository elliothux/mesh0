import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { client } from "../lib/orpc";

type StatusRows = Awaited<ReturnType<typeof client.status.list>>;
type LoadState = "error" | "loading" | "ready";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [rows, setRows] = useState<StatusRows>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    void client.status
      .list()
      .then((nextRows) => {
        if (active) {
          setRows(nextRows);
          setLoadState("ready");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : String(error),
          );
          setLoadState("error");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <section className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-300">Mesh0</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Dashboard
            </h1>
          </div>
          <div className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
            API {loadState}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-base font-medium">D1 app_status</h2>
          </div>

          {loadState === "loading" ? (
            <div className="px-4 py-6 text-sm text-zinc-400">Loading</div>
          ) : null}

          {loadState === "error" ? (
            <div className="px-4 py-6 text-sm text-red-300">{errorMessage}</div>
          ) : null}

          {loadState === "ready" ? (
            rows.length > 0 ? (
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="w-1/4 px-4 py-3 font-medium">Key</th>
                    <th className="w-1/2 px-4 py-3 font-medium">Value</th>
                    <th className="w-1/4 px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="border-t border-zinc-800" key={row.key}>
                      <td className="px-4 py-3 text-zinc-100">{row.key}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.value}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        {row.updatedAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-6 text-sm text-zinc-400">No rows</div>
            )
          ) : null}
        </div>
      </section>
    </main>
  );
}
