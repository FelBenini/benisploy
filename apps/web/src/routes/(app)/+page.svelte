<script lang="ts">
  let { data } = $props();

  let loggingOut = $state(false);
  let deploying = $state(false);

  async function logout() {
    loggingOut = true;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }
  let deployResult = $state<unknown>(null);
  let deployError = $state<string | null>(null);
  let deployLogs = $state<Array<{ stream: string; message: string }>>([]);
  let deployStatus = $state<string | null>(null);

  let appName = $state("test-app");
  let dockerImage = $state("nginx:alpine");
  let containerPort = $state("80");
  let envKey = $state("");
  let envVal = $state("");
  let envVars = $state<Record<string, string>>({});

  let servers = $state<Array<{ id: string; name: string; status: string }>>([]);

  async function loadServers() {
    try {
      const res = await fetch("/api/servers");
      if (res.ok) {
        const body = await res.json();
        servers = body.data ?? [];
      }
    } catch {
      // silently fail
    }
  }

  loadServers();

  async function deploy() {
    deploying = true;
    deployError = null;
    deployResult = null;
    deployLogs = [];
    deployStatus = null;

    const first = servers[0];
    if (!first) {
      deployError = "No servers registered. Add a server first.";
      deploying = false;
      return;
    }

    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: first.id,
          appSpec: {
            name: appName || "test-app",
            image: dockerImage || "nginx:alpine",
            ports: containerPort ? [{ container: parseInt(containerPort), protocol: "tcp" }] : [],
            envVars,
          },
        }),
      });

      const body = await res.json();
      if (res.ok) {
        deployResult = body.data;
        const depId = body.data.deployment?.id;
        if (depId) {
          subscribeToDeploymentLogs(depId);
        }
      } else {
        deployError = body.error ?? "Unknown error";
        deploying = false;
      }
    } catch (err) {
      deployError = err instanceof Error ? err.message : "Request failed";
      deploying = false;
    }
  }

  function subscribeToDeploymentLogs(deploymentId: string) {
    const evtSource = new EventSource(`/api/deployments/${deploymentId}/events`);

    evtSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "log") {
          deployLogs = [...deployLogs, parsed.entry];
        } else if (parsed.type === "complete") {
          deployStatus = parsed.result.success ? "healthy" : "failed";
          if (parsed.result.error) {
            deployError = parsed.result.error;
          }
          deploying = false;
          evtSource.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      deployStatus = "disconnected";
      deploying = false;
      evtSource.close();
    };
  }

  function addEnvVar() {
    if (!envKey.trim()) return;
    envVars = { ...envVars, [envKey.trim()]: envVal };
    envKey = "";
    envVal = "";
  }

  function removeEnvVar(key: string) {
    const next = { ...envVars };
    delete next[key];
    envVars = next;
  }

  let logContainer = $state<HTMLDivElement | null>(null);
  $effect(() => {
    if (deployLogs.length && logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });
</script>

<svelte:head>
  <title>Dashboard — Benisploy</title>
</svelte:head>

<div class="page">
  <header>
    <h1>Benisploy</h1>
    <button onclick={logout} disabled={loggingOut}>
      {loggingOut ? "Signing out…" : "Sign out"}
    </button>
  </header>

  <main>
    <section>
      <h2>Test Deployment</h2>
      <p class="hint">
        Deploys to <strong>{servers[0]?.name ?? "—"}</strong>
        {#if servers.length === 0}
          <em>(no servers found — register one first via <code>POST /api/servers</code>)</em>
        {/if}
      </p>

      <form onsubmit={(e) => { e.preventDefault(); deploy(); }}>
        <label>
          App name
          <input type="text" bind:value={appName} placeholder="my-app" />
        </label>

        <label>
          Docker image
          <input type="text" bind:value={dockerImage} placeholder="nginx:alpine" />
        </label>

        <label>
          Container port
          <input type="number" bind:value={containerPort} placeholder="80" min="1" max="65535" />
        </label>

        <fieldset>
          <legend>Environment variables (optional)</legend>

          <div class="env-row">
            <input type="text" bind:value={envKey} placeholder="KEY" />
            <input type="text" bind:value={envVal} placeholder="value" />
            <button type="button" onclick={addEnvVar}>Add</button>
          </div>

          {#each Object.entries(envVars) as [key, val] (key)}
            <div class="env-row">
              <code>{key}</code>
              <span>=</span>
              <code>{val}</code>
              <button type="button" onclick={() => removeEnvVar(key)}>✕</button>
            </div>
          {/each}
        </fieldset>

        <button type="submit" disabled={deploying || servers.length === 0}>
          {deploying ? "Deploying…" : "Deploy"}
        </button>
      </form>

      {#if deployLogs.length > 0}
        <div class="logs" bind:this={logContainer}>
          {#each deployLogs as log (log.timestamp + log.message)}
            <div class="log-line" class:stderr={log.stream === "stderr"}>
              <span class="log-stream">{log.stream === "stderr" ? "ERR" : "OUT"}</span>
              <span class="log-msg">{log.message}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if deployStatus}
        <div class="result" class:success={deployStatus === "healthy"} class:error={deployStatus === "failed"}>
          <h3>{deployStatus === "healthy" ? "Deploy succeeded" : "Deploy failed"}</h3>
        </div>
      {/if}

      {#if deployError && !deployLogs.length}
        <div class="result error">
          <h3>Error</h3>
          <pre>{deployError}</pre>
        </div>
      {/if}

      {#if deployResult && !deployLogs.length}
        <div class="result success">
          <h3>Deploy started</h3>
          <pre>{JSON.stringify(deployResult, null, 2)}</pre>
        </div>
      {/if}
    </section>

    <hr />

    <section>
      <h2>Session</h2>
      <pre>{JSON.stringify(data.session, null, 2)}</pre>
    </section>
  </main>
</div>

<style>
  .page {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
  }

  h3 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }

  .hint {
    font-size: 0.8125rem;
    color: #666;
    margin: 0 0 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  input {
    padding: 0.375rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  fieldset {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.75rem;
  }

  legend {
    font-size: 0.8125rem;
    font-weight: 500;
    padding: 0 0.25rem;
  }

  .env-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.375rem;
  }

  .env-row input {
    flex: 1;
  }

  button {
    padding: 0.375rem 0.75rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover {
    background: #1d4ed8;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button[type="button"] {
    background: #6b7280;
  }

  button[type="button"]:hover {
    background: #4b5563;
  }

  .logs {
    margin-top: 1rem;
    background: #1e1e2e;
    color: #cdd6f4;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    padding: 0.75rem;
    border-radius: 4px;
    max-height: 400px;
    overflow-y: auto;
  }

  .log-line {
    display: flex;
    gap: 0.5rem;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .log-line.stderr {
    color: #f38ba8;
  }

  .log-stream {
    flex-shrink: 0;
    width: 2.5rem;
    color: #6c7086;
    user-select: none;
  }

  .log-msg {
    flex: 1;
  }

  .result {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 4px;
  }

  .result.error {
    background: #fef2f2;
    border: 1px solid #fecaca;
  }

  .result.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
  }

  pre {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.8125rem;
    line-height: 1.5;
    margin: 0;
  }

  hr {
    border: none;
    border-top: 1px solid #eee;
    margin: 2rem 0;
  }
</style>
