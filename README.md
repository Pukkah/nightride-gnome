# Nightride FM — GNOME Shell Extension

A GNOME Shell extension that adds a panel indicator for streaming [nightride.fm](https://nightride.fm) internet radio stations.

![GNOME 46](https://img.shields.io/badge/GNOME-46-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Stations

- Nightride FM
- Chillsynth FM
- Darksynth
- Datawave FM
- Spacesynth FM
- Horrorsynth
- EBSM

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
