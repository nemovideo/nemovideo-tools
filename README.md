# NemoVideo Tools

AI video creation and editing from the command line. Describe what you want, AI creates it.

> Create videos by chatting — no GUI needed. Works with Claude Code, Codex, OpenClaw, Cursor, and any AI IDE.

## Quick Start

```bash
npm install -g nemovideo-tools
nemovideo setup
nemovideo create --prompt "5-second coffee product showcase" --export
```

## What It Does

- **Text to Video** — describe a scene, get a video
- **AI Editing** — add BGM, titles, transitions by chatting
- **Export** — render and download MP4
- **Upload** — bring your own footage

## Prerequisites

- Node.js >= 18
- NemoVideo account with API key ([nemovideo.com](https://nemovideo.com))

## Install

```bash
# Global install
npm install -g nemovideo-tools

# Or run without install
npx nemovideo-tools create --prompt "..."

# Claude Code plugin install
claude install-plugin nemovideo/nemovideo-tools
```

## Setup

```bash
nemovideo setup
```

This guides you through:
1. Register at nemovideo.com
2. Generate API key at nemovideo.com workspace → API Keys
3. Paste key into CLI

## Commands

| Command | Description |
|---------|-------------|
| `nemovideo create -p "..."` | Create a new video |
| `nemovideo chat <id> -p "..."` | Edit an existing project |
| `nemovideo export <id>` | Render and download |
| `nemovideo upload <file> --project <id>` | Upload assets |
| `nemovideo open <id>` | Open in browser |
| `nemovideo project list` | List projects |
| `nemovideo project get <id>` | Project details |
| `nemovideo project download <id>` | Download video |
| `nemovideo credits` | Check balance |
| `nemovideo credits history` | Credit usage (`GET /billing/usage/conversations`) |
| `nemovideo setup` | Configure API key |
| `nemovideo config set/get` | Manage settings |

## Examples

```bash
# Create and auto-export
nemovideo create -p "10s tech product demo, modern style" -d 10 --export

# Create, edit, then export
nemovideo create -p "coffee product showcase"
nemovideo chat proj_abc -p "add lo-fi background music"
nemovideo chat proj_abc -p "add title 'Morning Brew' at the beginning"
nemovideo export proj_abc -o ./coffee-video.mp4

# Check credits and usage history
nemovideo credits
nemovideo credits history
nemovideo credits history --all-pages --json
nemovideo credits history --project-id proj_abc123

# Upload your own footage
nemovideo upload ./raw-footage.mp4 --project proj_abc
nemovideo chat proj_abc -p "trim to first 5 seconds and add subtitles"
```

## Configuration

Config stored at `~/.config/nemovideo/config.json`.

```bash
nemovideo config set api_key nmv_usr_xxx     # API token
nemovideo config set base_url https://...     # Gateway URL
nemovideo config set output_dir ./output      # Default output directory
nemovideo config get                          # Show all config
```

Environment variable `NEMOVIDEO_API_KEY` overrides the stored api_key:
```bash
export NEMOVIDEO_API_KEY=nmv_usr_xxx
nemovideo credits
```

## For AI IDE Users

This package comes with a `SKILL.md` that teaches AI agents (Cursor, Claude Code, etc.) how to use it. Install the package, and your AI assistant can create videos for you.

## Supported Formats

| Type | Formats |
|------|---------|
| Video | mp4, mov, avi, webm, mkv |
| Image | jpg, png, gif, webp |
| Audio | mp3, wav, m4a, aac |

## Links

- [NemoVideo](https://nemovideo.com) — Product website
- [Documentation](https://docs.nemovideo.com) — Full docs

## License

MIT
