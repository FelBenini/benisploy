# tool-schemas

JSON Schema definitions for the Orchestrator API tool surface.

Each orchestrator function (`create_app`, `set_domain`, `diagnose`, etc.) has a self-describing schema:

- Input parameters (Zod on the TS side)
- Output shape
- Whether confirmation is required

This package is the source of truth for the AI agent's function-calling tool definitions.
