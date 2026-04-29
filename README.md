# NemoVideo CLI

AI video creation and editing from the command line. Describe what you want, AI creates it.

> Create videos by chatting — no GUI needed. Works with Cursor, Claude Code, and any AI IDE.

## Quick Start

```bash
npm install -g nemovideo-cli
nemo setup
nemo create --prompt "5-second coffee product showcase" --export
```

## What It Does

- **Text to Video** — describe a scene, get a video
- **AI Editing** — add BGM, titles, transitions by chatting
- **Export** — render and download MP4
- **Upload** — bring your own footage

## Prerequisites

- Node.js >= 18
- NemoVideo account with credits ([nemovideo.com](https://nemovideo.com))

## Install

```bash
# Global install
npm install -g nemovideo-cli

# Or run without install
npx nemovideo-cli create --prompt "..."
```

## Setup

```bash
nemo setup
```

This guides you through:
1. Register at nemovideo.com
2. Add credits at nemovideo.com/dashboard/billing
3. Generate API key at nemovideo.com/dashboard/api-tokens
4. Paste key into CLI

## Commands

| Command | Description |
|---------|-------------|
| `nemo create -p "..."` | Create a new video |
| `nemo chat <id> -p "..."` | Edit an existing project |
| `nemo export <id>` | Render and download |
| `nemo upload <file> --project <id>` | Upload assets |
| `nemo open <id>` | Open in browser |
| `nemo project list` | List projects |
| `nemo project get <id>` | Project details |
| `nemo project download <id>` | Download video |
| `nemo credits` | Check balance |
| `nemo setup` | Configure API key |
| `nemo config set/get` | Manage settings |

## Examples

```bash
# Create and auto-export
nemo create -p "10s tech product demo, modern style" -d 10 --export

# Create, edit, then export
nemo create -p "coffee product showcase"
nemo chat proj_abc -p "add lo-fi background music"
nemo chat proj_abc -p "add title 'Morning Brew' at the beginning"
nemo export proj_abc -o ./coffee-video.mp4

# Upload your own footage
nemo upload ./raw-footage.mp4 --project proj_abc
nemo chat proj_abc -p "trim to first 5 seconds and add subtitles"
```

## Configuration

Config stored at `~/.config/nemovideo/config.json`.

```bash
nemo config set api_key nmv_usr_xxx     # API token
nemo config set base_url https://...     # Gateway URL
nemo config set output_dir ./output      # Default output directory
nemo config get                          # Show all config
```

Environment variable `NEMOVIDEO_API_KEY` overrides the stored api_key:
```bash
export NEMOVIDEO_API_KEY=nmv_usr_xxx
nemo credits
```

## For AI IDE Users

This CLI comes with a `SKILL.md` that teaches AI agents (Cursor, Claude Code, etc.) how to use it. Install the CLI, and your AI assistant can create videos for you.

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
