---
name: AI provider fallback integrity
description: Rules for transparent MINA TEACH AI provider status and fallback answers.
---

For text requests, a fallback may return an answer only after the alternate provider actually succeeds. If the request asked for current web research and Gemini fails, a MiniMax fallback is general model knowledge only: explicitly say no search occurred, provide no fabricated citations, and warn that current claims are unverified. Never route image requests or safety-blocked prompts through a text fallback.

Treat configured credentials and provider availability as separate facts. A stored key is not proof of a successful connection; status should say when a provider has not been tested or when its last real request failed.

**Why:** Students need to know whether an answer is current or source-verified, and provider outages must not be hidden behind invented answers or status.

**How to apply:** Preserve these distinctions when changing tutor routing, retry behavior, provider health checks, image analysis, or web-search presentation.
