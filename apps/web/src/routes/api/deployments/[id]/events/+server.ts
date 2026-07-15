import type { RequestHandler } from "./$types";
import { getNodeAgentWsServer } from "$lib/server/adapters/node-agent-ws";

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.session || !locals.orgId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return new Response("Missing deployment ID", { status: 400 });
  }

  const server = getNodeAgentWsServer();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const buffered = server.getBufferedLogs(id);
      for (const entry of buffered) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "log", entry })}\n\n`),
        );
      }

      const unsubLog = server.onDeploymentLog(id, (entry) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "log", entry })}\n\n`,
            ),
          );
        } catch {
          unsubLog();
          unsubComplete();
        }
      });

      const unsubComplete = server.onDeploymentComplete(id, (result) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "complete", result })}\n\n`,
            ),
          );
        } finally {
          unsubLog();
          unsubComplete();
          controller.close();
        }
      });

      cleanup = () => {
        unsubLog();
        unsubComplete();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
