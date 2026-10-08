# Learning Service (services/learning)

Persistence layer for user preference data that drives the AI suggestion
loop. Lives entirely on-device; nothing is sent to a remote service.

## Responsibilities

| Store | Description |
|---|---|
| User preferences | Which effect cores / presets a user favourited or dismissed. |
| Preset usage | Frequency and recency of each preset being applied. |
| Refinement history | Parameter tweaks recorded during a session so the hypothesis generator can learn. |

## Architecture

```
Edit (IndexedDB)   services/learning
     ────────────►  (user prefs +
                    preset usage +
                    refinement log)
                         │
                         ▼
                    services/ai
                 (feature weighting)
```

Preferences feed back into `services/ai` to bias future hypothesis generation
toward the user's actual style. Data is stored as small JSON documents
synchronised through `packages/sync` (GitHub-backed for cross-device).

## Local development

A minimal in-memory implementation is intended; until then this README
captures the contract so the `learningstore` adapter in the desktop client
can be authored against it.

## Security & privacy

- Stored locally only.
- No telemetry, no anonymous identifiers.
- Data is covered by the same sync path as documents (no plaintext
  credentials ever logged).
