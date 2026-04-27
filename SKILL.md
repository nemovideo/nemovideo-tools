---
name: nemo-video
version: "0.1.0"
description: >
  AI video creation and editing via CLI. Create videos from text descriptions,
  edit with background music, titles, transitions, and export MP4 files.
  Requires API key from nemovideo.com (paid).
  Supports mp4, mov, avi, webm, mkv, jpg, png, gif, webp, mp3, wav, m4a, aac.
homepage: https://nemovideo.com
repository: https://github.com/nemovideo/nemovideo-cli
metadata: {"openclaw": {"emoji": "🎬", "requires": {"env": [], "configPaths": ["~/.config/nemovideo/"]}, "primaryEnv": "NEMO_API_KEY"}}
---

# NemoVideo CLI — AI Video Creation

Create and edit videos by running `nemo` commands. No GUI needed.

## Prerequisites

Requires Node.js >= 18 and a paid NemoVideo account.

```bash
npm install -g nemovideo-cli
nemo setup
```

`nemo setup` guides you through: register → billing → API key configuration.
If already configured, verify with `nemo credits`.

## Commands

### Create Video

```bash
nemo create --prompt "5-second coffee product showcase, warm tones"
nemo create --prompt "10s tech demo" --duration 10 --ratio 16:9
nemo create --prompt "short intro" --export              # create + auto export
nemo create --prompt "short intro" --export -o ./out.mp4 # with custom output path
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--prompt` | `-p` | (required) | Video description |
| `--duration` | `-d` | 5 | Duration in seconds |
| `--ratio` | `-r` | 16:9 | Aspect ratio: 16:9, 9:16, 1:1 |
| `--export` | `-e` | off | Auto export after creation |
| `--output` | `-o` | ./output/<name>.mp4 | Output path (with --export) |

Returns `project_id` for subsequent commands.

### Edit Existing Project

```bash
nemo chat <project_id> --prompt "add background music"
nemo chat <project_id> --prompt "change duration to 10 seconds"
nemo chat <project_id> --prompt "add title 'Hello World' at the beginning"
```

### Export Video

```bash
nemo export <project_id>
nemo export <project_id> --output ./my-video.mp4
```

Export is free — only creation/editing consumes credits.

### Upload Assets

```bash
nemo upload ./footage.mp4 --project <project_id>
nemo upload ./music.mp3 --project <project_id>
nemo upload ./logo.png --project <project_id>
```

Supported: mp4, mov, avi, webm, mkv, jpg, png, gif, webp, mp3, wav, m4a, aac.

### Open in Browser

```bash
nemo open <project_id>
```

### Project Management

```bash
nemo project list
nemo project get <project_id>
nemo project download <project_id> --output ./video.mp4
```

### Credits

```bash
nemo credits                   # check balance
nemo credits history           # consumption history
```

## Typical Workflow

```bash
# 1. Create a video
nemo create -p "product showcase video, 10 seconds, modern style" -d 10

# 2. Edit it
nemo chat <project_id> -p "add upbeat background music"
nemo chat <project_id> -p "add title 'Our Product' at the beginning"

# 3. Export
nemo export <project_id> -o ./product-video.mp4

# 4. Or do it all in one step
nemo create -p "product showcase" --export -o ./product-video.mp4
```

## One-Step Workflow (for simple requests)

```bash
nemo create --prompt "5-second sunset timelapse" --export
```

## Error Handling

| Error | What to do |
|-------|------------|
| "API key not configured" | Run `nemo setup` |
| "Token expired" | Run `nemo setup` to reconfigure |
| "Insufficient credits" | Top up at nemovideo.com/dashboard/billing |
| "Rate limited" | Wait a moment and retry |
| Connection dropped | Run `nemo project get <id>` to check status |

## Configuration

```bash
nemo config set api_key <nmv_usr_xxx>
nemo config set base_url https://mega-x-api.nemovideo.ai
nemo config set output_dir ./output
nemo config get
```

Config stored at `~/.config/nemovideo/config.json`.

## Cost Reference

- Video creation: ~100 credits/clip
- Video editing: ~50 credits/session
- Export/render: free
- Check balance: `nemo credits`
