# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nightride FM — a GNOME Shell extension that adds a panel indicator for streaming nightride.fm internet radio stations. Written in GJS (GNOME JavaScript) targeting GNOME Shell 46.

## Project Structure

The entire extension lives in `nightride@pukkah.dev/`:
- `extension.js` — Single-file implementation (~540 lines). Contains `_MarqueeClip` (clip container for now-playing marquee), `NightrideIndicator` (panel button + dropdown menu), and `NightrideExtension` (enable/disable lifecycle).
- `metadata.json` — Extension metadata (uuid, shell-version, settings-schema)
- `schemas/org.gnome.shell.extensions.nightride.gschema.xml` — GSettings schema for `volume` (double) and `station` (string)
- `schemas/gschemas.compiled` — Pre-compiled GSettings binary
- `icons/nightride-symbolic.svg` — Panel icon
- `noise.png` — Tiled noise texture for the animated overlay in the controls row
- `stylesheet.css` — CSS for the controls UI (gradient stack, play/mute buttons, volume slider styling)

## Development

**No build system** — no package.json, Makefile, or test framework.

**Install**: Copy `nightride@pukkah.dev/` to `~/.local/share/gnome-shell/extensions/` and enable with GNOME Extensions app.

**Recompile schemas** after changing the `.gschema.xml`:
```
glib-compile-schemas nightride@pukkah.dev/schemas/
```

**Test changes**: Log out and back in (Wayland) or press Alt+F2 → `r` (X11). Check logs with `journalctl -f -o cat /usr/bin/gnome-shell`.

## Architecture

Audio playback uses GStreamer's `playbin` element. The flow: `_createPipeline()` creates the playbin → `_play()` sets the stream URI and state to PLAYING → on GStreamer bus errors, `_scheduleReconnect()` retries after 5 seconds. Settings (volume, selected station) persist via GSettings.

The `STATIONS` array at the top of `extension.js` defines all available stations as `{key, label, url}` objects with MP3 stream URLs. `STATION_GRADIENTS` maps each station key to a `{start, end}` hex color pair for the controls row background.

### Menu UI

The popup menu has three sections:
1. **Controls row** — a layered stack (gradient background → animated noise overlay → controls box). The controls box contains a play/stop button, volume slider, and mute toggle. The noise overlay uses a tiled `noise.png` loaded via `GdkPixbuf` → `Clutter.Image` with `content_repeat: BOTH`, animated by randomly flipping X/Y scale every 120ms while playing.
2. **Now-playing label** — shows current track title from GStreamer `tag` bus messages. Uses a `_MarqueeClip` container (`St.Widget` subclass returning `[0, 0]` preferred width) with `FixedLayout` + `clip_to_allocation` so long titles are clipped to menu width and scroll via `Clutter.ease()` marquee animation (2s pause → scroll left at ~40px/s → 1.5s pause → reset → repeat).
3. **Station list** — standard `PopupMenuItem`s with check ornaments for the active station.

## Key GJS/GNOME Patterns

- Imports use `gi://` protocol for GObject introspection bindings (Gio, GLib, GObject, Gst, St, Clutter, Cogl, GdkPixbuf) and `resource:///` for Shell internals. No Pango import — marquee scrolling replaced ellipsize.
- Classes registered with `GObject.registerClass()` for GObject type system integration
- Extension lifecycle: `enable()` creates the indicator, `disable()` must clean up all resources (pipelines, signals, timeouts, noise animation timer, marquee timer/transitions)
- Code style: 2-space indent, double quotes, Prettier-formatted
