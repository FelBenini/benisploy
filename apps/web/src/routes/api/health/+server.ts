import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Cache the health check result for 5 seconds to reduce DB load
let lastHealthCheck = {
  timestamp: 0,
  healthy: false,
};

const HEALTH_CHECK_CACHE_TTL = 5000; // 5 seconds

export const GET: RequestHandler = async () => {
  try {
    const now = Date.now();

    // Use cached result if still valid
    if (now - lastHealthCheck.timestamp < HEALTH_CHECK_CACHE_TTL) {
      if (lastHealthCheck.healthy) {
        return healthyResponse();
      }

      return unhealthyResponse("Service degraded");
    }

    await checkDatabaseHealth();

    lastHealthCheck = {
      timestamp: now,
      healthy: true,
    };

    return healthyResponse();
  } catch (error) {
    lastHealthCheck = {
      timestamp: Date.now(),
      healthy: false,
    };

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("[Health Check] Error:", message);

    return unhealthyResponse(message);
  }
};

async function checkDatabaseHealth(): Promise<void> {
  // try {
  //   // Replace with your database query
  //   await db.execute('SELECT 1');
  // } catch (error) {
  //   throw new Error(
  //     `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'
  //     }`
  //   );
  // }
}

function healthyResponse() {
  return json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? "development",
      version: process.env.npm_package_version ?? "0.1.0",
    },
    { status: 200 },
  );
}

function unhealthyResponse(error: string) {
  return json(
    {
      status: "error",
      message: error,
      timestamp: new Date().toISOString(),
    },
    { status: 503 },
  );
}
