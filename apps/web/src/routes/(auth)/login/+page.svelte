<script lang="ts">
  import { goto } from "$app/navigation";
  let { data } = $props();

  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = "";
    loading = true;

    const endpoint = data.configured ? "/api/auth/login" : "/api/auth/setup";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json();
        error = body.error ?? "Something went wrong";
        return;
      }
      goto("/");
    } catch {
      error = "Network error";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{data.configured ? "Sign in" : "Set up"} — Benisploy</title>
</svelte:head>

<div class="page">
  <div class="card">
    <h1>Benisploy</h1>
    <h2>{data.configured ? "Sign in" : "Set up your instance"}</h2>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <form onsubmit={handleSubmit}>
      <label>
        Email
        <input type="email" bind:value={email} required autocomplete="email" />
      </label>

      <label>
        Password
        <input
          type="password"
          bind:value={password}
          required
          minlength={data.configured ? 1 : 8}
          autocomplete={data.configured ? "current-password" : "new-password"}
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? "Please wait…" : data.configured ? "Sign in" : "Set up"}
      </button>
    </form>
  </div>
</div>

<style>
  .page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f5f5f5;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .card {
    background: white;
    border-radius: 8px;
    padding: 2rem;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
  }

  h2 {
    font-size: 0.875rem;
    color: #666;
    font-weight: 400;
    margin: 0 0 1.5rem;
  }

  .error {
    background: #fef2f2;
    color: #dc2626;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
  }

  input {
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 1rem;
  }

  input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  button {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }

  button:hover {
    background: #1d4ed8;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
