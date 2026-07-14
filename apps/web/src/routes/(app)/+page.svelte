<script lang="ts">
  let { data } = $props();
  let loggingOut = $state(false);

  async function logout() {
    loggingOut = true;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }
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
    <h2>Session</h2>
    <pre>{JSON.stringify(data.session, null, 2)}</pre>
  </main>
</div>

<style>
  .page {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
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

  button {
    padding: 0.375rem 0.75rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  button:hover {
    background: #dc2626;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  pre {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.8125rem;
    line-height: 1.5;
  }
</style>
