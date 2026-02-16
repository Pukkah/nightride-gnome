# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nightride FM — a GNOME Shell extension that adds a panel indicator for streaming nightride.fm internet radio stations. Written in GJS (GNOME JavaScript) targeting GNOME Shell 46.

## Project Structure

The entire extension lives in `nightride@pukkah.dev/`:
- `extension.js` — Single-file implementation (~225 lines). Contains `NightrideIndicator` (panel button + dropdown menu) and `NightrideExtension` (enable/disable lifecycle).
- `metadata.json` — Extension metadata (uuid, shell-version, settings-schema)
- `schemas/org.gnome.shell.extensions.nightride.gschema.xml` — GSettings schema for `volume` (double) and `station` (string)
- `schemas/gschemas.compiled` — Pre-compiled GSettings binary
- `icons/nightride-symbolic.svg` — Panel icon
- `stylesheet.css` — Minimal CSS (volume slider width)

## Development

**No build system** — no package.json, Makefile, or test framework.

**Install**: Copy `nightride@pukkah.dev/` to `~/.local/share/gnome-shell/extensions/` and enable with GNOME Extensions app.

**Recompile schemas** after changing the `.gschema.xml`:
```
glib-compile-schemas nightride@pukkah.dev/schemas/
```

**Test changes**: Log out and back in (Wayland) or press Alt+F2 → `r` (X11). Check logs with `journalctl -f -o cat /usr/bin/gnome-shell`.

## Architecture

Audio playback uses GStreamer's `playbin` element. The flow: `_ensurePipeline()` creates the playbin → `_play()` sets the stream URI and state to PLAYING → on GStreamer bus errors, `_scheduleReconnect()` retries after 5 seconds. Settings (volume, selected station) persist via GSettings.

The `STATIONS` array at the top of `extension.js` defines all available stations as `{key, label, url}` objects with HLS stream URLs.

## Key GJS/GNOME Patterns

- Imports use `gi://` protocol for GObject introspection bindings and `resource:///` for Shell internals
- Classes registered with `GObject.registerClass()` for GObject type system integration
- Extension lifecycle: `enable()` creates the indicator, `disable()` must clean up all resources (pipelines, signals, timeouts)
