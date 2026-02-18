# Nightride FM — GNOME Shell Extension

A GNOME Shell extension that adds a panel indicator for streaming [nightride.fm](https://nightride.fm) internet radio stations.

![GNOME 46](https://img.shields.io/badge/GNOME-46-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Features

- Stream 7 stations: Nightride FM, Chillsynth FM, Datawave FM, Spacesynth FM, Darksynth, Horrorsynth, EBSM
- Panel icon with play indicator badge
- Middle-click panel icon to toggle playback
- Scroll on panel icon to adjust volume
- Per-station gradient backgrounds with animated noise overlay
- Now-playing track display with marquee scrolling for long titles
- Volume slider and mute toggle
- Remembers volume and station selection between sessions

## Installation

Copy the extension directory to your GNOME Shell extensions folder:

```sh
cp -r nightride@pukkah.dev ~/.local/share/gnome-shell/extensions/
```

Then enable it using the GNOME Extensions app or:

```sh
gnome-extensions enable nightride@pukkah.dev
```

### Reloading

- **Wayland** — log out and back in
- **X11** — Alt+F2 → `r`

## Dependencies

- GNOME Shell 46
- GStreamer (for audio playback)

## License

[MIT](LICENSE)
