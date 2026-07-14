import { defineEnvVars } from "@sveltejs/kit/hooks";

export const variables = defineEnvVars({
  DATABASE_URL: {},
  NODE_AGENT_WS_PORT: {},
});
