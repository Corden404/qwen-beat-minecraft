# Qwen 3.5 9B Minecraft Agent

[English](README.md) | [简体中文](README.zh-CN.md)

Run local Qwen 3.5 9B as both planner and action selector in Minecraft Java 1.16.5, with a visible native client, continuous recording, and saved victory evidence.

This Windows adaptation is based on [rmalde/minecraft-agent](https://github.com/rmalde/minecraft-agent). The upstream uses Astra/Sol for planning and JEV for action selection; this version sends both roles to one local Qwen service through a schema-constrained relay.

## Scope and control

The agent starts with an empty inventory in a fresh **Survival / Peaceful** world, collects supplies, travels through the Nether, enters the End, kills the dragon with beds, and returns through the exit portal.

The seed is `8398967436125155523`, with a previously surveyed route. It contains village supplies and a naturally active End portal, so this route does not require blaze rods or crafting Eyes of Ender. Known coordinates are supplied to the agent.

Qwen receives structured game observations and chooses bounded actions. Mineflayer executes pathfinding and normal player interactions. A read-only server sensor exposes dragon state for combat timing. The native client supplies the recording; decisions use structured state rather than screenshots or individual keyboard inputs. This demonstrates completion under these conditions, rather than general random-seed Minecraft competence.

## Verified local result

The preserved run `qwen-win-04` completed with these results:

| Metric | Result |
| --- | --- |
| Planner / action selector | Qwen 3.5 9B / Qwen 3.5 9B |
| Tested weights | GGUF Q4_K_M |
| Completion time from recording start | 13 min 55.391 sec |
| Continuous video duration | 14 min 3.500 sec |
| Plans / action selections | 16 / 137 |
| Bed explosions / deaths | 6 / 0 |
| Health on exit | 20 / 20 |
| Failed actions | 8, followed by recovery |
| Operator repairs / restarts during this run | 0 / 0 |
| Original recording | 960 × 540, 20 fps, no audio |

All 18 full-run verification checks and eight additional route/camera/UI checks passed. Evidence includes complete video decoding, saved-world dragon state, a fresh empty inventory, recorded model identities, and source hashes. This is one verified successful run; earlier failed trials remain local. It is not a measured success rate.

## Requirements

- Windows and PowerShell; the supplied Windows workflow was verified locally.
- Node.js 22+, Python with `pip`, and a Java 17 **JDK** providing `javac` and `jar`.
- Downloaded Qwen weights and an independently started local `llama-server`. The project does not download or start the model service.
- Network access during setup for npm, FFmpeg, Minecraft binaries/assets, and Maven dependencies.
- Available ports: `8081` for the default model service; `25576`, `25578`, `3078`, `3093`, and `3099` for project components.

The tested configuration used Qwen 3.5 9B Q4_K_M, an RTX 4060 Laptop GPU with 8 GiB VRAM, a 4096-token context, and one inference slot. Resource requirements and speed vary with quantization and runtime settings.

## Windows quick start

Run commands from the repository root.

### 1. Install dependencies

```powershell
.\windows\setup.ps1
```

If the JDK cannot be discovered through `javac.exe`, set its directory first:

```powershell
$env:MC_JAVA_HOME = 'D:\Tools\jdk-17'
.\windows\setup.ps1
```

Setup installs dependencies, downloads Minecraft Java 1.16.5, builds the read-only sensor and native capture adapter, and creates `.runtime/config.json`. Python packages use the Tsinghua mirror; npm and Minecraft/Maven dependencies use their upstream repositories.

### 2. Accept the Minecraft EULA

Read the [Minecraft EULA](https://aka.ms/MinecraftEULA). If you accept it, change the generated `server/eula.txt` to contain:

```text
eula=true
```

The launcher refuses to start without this setting.

### 3. Start the local model

Example for an existing llama.cpp installation; replace both paths with your own:

```powershell
& 'D:\Tools\llama.cpp\llama-server.exe' `
  -m 'D:\Models\Qwen3.5-9B-Q4_K_M.gguf' `
  --alias qwen3.5-9b --host 127.0.0.1 --port 8081 `
  -c 4096 -np 1 -ngl auto

# Check readiness in another PowerShell window:
Invoke-RestMethod 'http://127.0.0.1:8081/health'
```

The runtime must support the JSON Schema response format used by [qwen-relay.mjs](qwen-relay.mjs). The relay disables thinking through `chat_template_kwargs.enable_thinking=false` and uses temperature `0.7`, top-p `0.8`, and top-k `20`.

Defaults are `http://127.0.0.1:8081/v1` and alias `qwen3.5-9b`. To change them, edit `modelBase` and `model` in `.runtime/config.json` after setup, preserving the generated Java/FFmpeg paths. The supervisor also checks the model runtime's `/health`; a generic compatible API without that endpoint is insufficient. Only loopback model endpoints are accepted. Rerunning setup resets these generated settings.

### 4. Start a recorded run

```powershell
.\windows\start.ps1 -RunId qwen-demo-01 -MaxMinutes 60
```

Use a new run ID each time. The launcher creates a fresh world, starts the server, relay, agent, and native client, and records the game framebuffer. A visible Minecraft window appears after startup. Progress is at `http://127.0.0.1:3078`; the native picture is at `http://127.0.0.1:3078/view`.

After completion, the supervisor saves the world, finalizes the recording, stops its project processes, and verifies victory evidence. The shared Qwen service stays running. A stopped or failed run is preserved and is not classified as a victory.

To stop early:

```powershell
.\windows\stop.ps1
```

Stopping waits for an action boundary, world saving, and video finalization. Avoid forcibly closing the encoder or server while evidence is being written.

## Recordings, logs, and verification

| Location | Contents |
| --- | --- |
| `runs/<run>/full-playthrough.mp4` | Continuous native gameplay |
| `runs/<run>/events.jsonl` | Model requests/responses, choices, results, and events |
| `runs/<run>/run-config.json` | Run conditions, model identities, and source hashes |
| `runs/<run>/status.json` | Progress state |
| `runs/<run>/victory.json` | Dragon-death and exit-event evidence, when present |
| `runs/<run>/verification.json` | Saved-world and recording verification |
| `runs/<run>/source/` | Frozen source snapshot |
| `server/<run>/` | Saved world, including dragon fight state |
| `.runtime/runs/<run>/` | Process logs and supervisor diagnostics |

`victory.json` alone is insufficient to establish a verified result. Review the verification report, saved-world dragon state, and full video together. After stopping, repeat verification with:

```powershell
$env:FFMPEG_PATH = (Get-Content .runtime/config.json -Raw | ConvertFrom-Json).ffmpeg
node verify-run.mjs qwen-demo-01 qwen-demo-01
```

A separate local export for `qwen-win-04`, `full-playthrough-with-english-logs.mp4`, places gameplay above a synchronized English log panel. It includes all plans, 137 action choices and results, and eight failed actions. It is 1280 × 1080 at 20 fps, retaining the original duration and 16,870 frames. High-frequency camera/position telemetry is reflected in the status panel and retained in raw JSONL. Full decoding and 11 media/log checks passed.

The English transcript, subtitle track, coverage report, and hashes are stored alongside that export. **`start.ps1` produces the original recording; it does not automatically generate the English-log video.** Videos, evidence archives, and exports are excluded from Git and are not included in a fresh clone.

The recorder captures the game framebuffer, not the desktop, and has no audio. Review visible text and metadata before publishing. Raw evidence bundles can contain local paths and process configuration and need a separate privacy review.

## Storage and recoverable cleanup

New project dependencies, caches, temporary files, Minecraft assets, worlds, and videos live under the repository directory. Place the checkout on the drive you want to use. Existing Node/Python/Java installations and the external model are reused. Existing `.minecraft` assets may be copied after hash verification; its installation and settings are not modified.

Setup performs no global npm/Python package installs, registry edits, service creation, or scheduled tasks. Windows and GPU drivers can still create system caches or pagefile activity outside the project.

```powershell
.\windows\clean.ps1 -WhatIf       # Preview; no files moved
.\windows\clean.ps1               # Retain runs and recordings
.\windows\clean.ps1 -IncludeRuns  # Also move runs and recordings
```

Cleanup checks stopped project processes and validates targets, then moves generated files to `.trash/cleanup-<timestamp>/`. Source and external runtimes/models remain. The default keeps `runs/`, but moves saved server worlds and runtime logs, so archive those first if you need complete evidence. Files remain recoverable in `.trash`; disk space is reclaimed only when you choose to empty it. Rerun setup to restore dependencies.

## Development and troubleshooting

Run existing automated checks with `npm test`. Live Minecraft runs remain necessary to validate rendering, movement, inventory, combat, and recording.

- **No window:** inspect `.runtime/runs/<run>/supervisor.log` and client/server stderr logs. Successful finalization automatically closes the client.
- **Model error:** check `/health`, the alias, and `.runtime/config.json`. Start the model service first.
- **Port in use:** stop its owning process or the previous project run. Project ports are currently fixed in the supervisor.
- **Java build failure:** use a JDK rather than a JRE, and check `MC_JAVA_HOME`.
- **Download failure:** restore access to the package/game repositories and rerun setup.
- **Incomplete run:** retain logs and video, and inspect failed actions and verification rather than describing it as completed.

## Structure and attribution

- [windows/](windows/): Windows setup, supervision, status, stop, and cleanup.
- [qwen-relay.mjs](qwen-relay.mjs): local requests, schemas, and response validation.
- [nether-agent.mjs](nether-agent.mjs): game loop and stage progression.
- [optimization/nether/config.json](optimization/nether/config.json): surveyed route.
- [native-client/](native-client/): native rendering, UI synchronization, and capture.
- [observer/](observer/): read-only dragon sensor.
- [verify-run.mjs](verify-run.mjs): saved-world and recording checks.

Upstream cloud code remains in `models.mjs` and `model-relay.mjs`, using OpenRouter and Google Secret Manager with separate credential configuration. The Windows Qwen workflow needs none of those credentials. Upstream macOS launch/build scripts remain separate from the verified Windows workflow.

Built on [Minecraft Agent](https://github.com/rmalde/minecraft-agent), [Mineflayer](https://github.com/PrismarineJS/mineflayer), [Mineflayer Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder), and [llama.cpp](https://github.com/ggml-org/llama.cpp). Minecraft binaries, downloaded weights, worlds, and recordings are not distributed in this repository.
