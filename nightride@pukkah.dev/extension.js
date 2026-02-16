import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gst from "gi://Gst";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Cogl from "gi://Cogl";
import GdkPixbuf from "gi://GdkPixbuf";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

// prettier-ignore
const STATIONS = [
  { key: "nightride", label: "Nightride FM", url: "https://stream.nightride.fm/nightride.mp3" },
  { key: "chillsynth", label: "Chillsynth FM", url: "https://stream.nightride.fm/chillsynth.mp3" },
  { key: "datawave", label: "Datawave FM", url: "https://stream.nightride.fm/datawave.mp3" },
  { key: "spacesynth", label: "Spacesynth FM", url: "https://stream.nightride.fm/spacesynth.mp3" },
  { key: "darksynth", label: "Darksynth", url: "https://stream.nightride.fm/darksynth.mp3" },
  { key: "horrorsynth", label: "Horrorsynth", url: "https://stream.nightride.fm/horrorsynth.mp3" },
  { key: "ebsm", label: "EBSM", url: "https://stream.nightride.fm/ebsm.mp3" },
];

const STATION_GRADIENTS = {
  nightride: { start: "#CC00FF", end: "#7F00FF" },
  chillsynth: { start: "#26303c", end: "#2b3a4c" },
  datawave: { start: "#ffe696", end: "#000000" },
  spacesynth: { start: "#006d52", end: "#240027" },
  darksynth: { start: "#fd0090", end: "#2c0000" },
  horrorsynth: { start: "#00ff00", end: "#200000" },
  ebsm: { start: "#ffffff", end: "#666666" },
};

const NightrideIndicator = GObject.registerClass(
  class NightrideIndicator extends PanelMenu.Button {
    _init(ext) {
      super._init(0.0, "Nightride FM");

      this._ext = ext;
      this._settings = ext.getSettings();
      this._playing = false;
      this._pipeline = null;
      this._busWatchId = 0;
      this._reconnectTimeoutId = 0;
      this._signalIds = [];
      this._lastVolume = 0.5;
      this._noiseTimerId = 0;

      // Panel icon
      const iconPath = ext.path + "/icons/nightride-symbolic.svg";
      const gicon = Gio.icon_new_for_string(iconPath);
      this._icon = new St.Icon({
        gicon,
        style_class: "system-status-icon",
      });
      this.add_child(this._icon);

      this._buildMenu();
      this._loadSettings();
    }

    _buildMenu() {
      // Merged controls row
      const controlsItem = new PopupMenu.PopupBaseMenuItem({ activate: false });
      controlsItem.add_style_class_name("nightride-controls-item");

      const stack = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        style_class: "nightride-controls-stack",
        clip_to_allocation: true,
      });

      // Gradient layer
      this._gradientLayer = new St.Widget({
        x_expand: true,
        y_expand: true,
        reactive: false,
        style_class: "nightride-gradient",
      });
      stack.add_child(this._gradientLayer);

      // Noise layer — tiled via Clutter.Image + content_repeat
      this._noiseLayer = new St.Widget({
        x_expand: true,
        y_expand: true,
        reactive: false,
        style_class: "nightride-noise",
      });
      const pixbuf = GdkPixbuf.Pixbuf.new_from_file(
        this._ext.path + "/noise.png",
      );
      const noiseImage = new Clutter.Image();
      noiseImage.set_data(
        pixbuf.get_pixels(),
        pixbuf.get_has_alpha()
          ? Cogl.PixelFormat.RGBA_8888
          : Cogl.PixelFormat.RGB_888,
        pixbuf.get_width(),
        pixbuf.get_height(),
        pixbuf.get_rowstride(),
      );
      this._noiseLayer.set_content(noiseImage);
      this._noiseLayer.content_repeat = Clutter.ContentRepeat.BOTH;
      this._noiseLayer.set_pivot_point(0.5, 0.5);
      stack.add_child(this._noiseLayer);

      // Controls box
      const controlsBox = new St.BoxLayout({
        style_class: "nightride-controls-box",
        x_expand: true,
        vertical: false,
      });

      // Play/Pause button
      this._playButton = new St.Button({
        child: new St.Icon({
          icon_name: "media-playback-start-symbolic",
          style_class: "popup-menu-icon",
        }),
        style_class: "nightride-play-button",
      });
      this._playButton.connect("clicked", () => {
        if (this._playing) this._stop();
        else this._play();
      });
      controlsBox.add_child(this._playButton);

      // Volume slider
      this._volumeSlider = new Slider.Slider(0.5);
      this._volumeSlider.add_style_class_name("nightride-volume-slider");
      this._volumeSlider.x_expand = true;
      this._volumeSlider.connect("notify::value", () => {
        const vol = this._volumeSlider.value;
        this._settings.set_double("volume", vol);
        if (this._pipeline) this._pipeline.set_property("volume", vol);
        if (vol > 0) this._lastVolume = vol;
        this._updateMuteIcon();
      });
      controlsBox.add_child(this._volumeSlider);

      // Mute button
      this._muteButton = new St.Button({
        child: new St.Icon({
          icon_name: "audio-volume-medium-symbolic",
          style_class: "popup-menu-icon",
        }),
        style_class: "nightride-mute-button",
      });
      this._muteButton.connect("clicked", () => {
        this._toggleMute();
      });
      controlsBox.add_child(this._muteButton);

      stack.add_child(controlsBox);
      controlsItem.add_child(stack);
      this.menu.addMenuItem(controlsItem);

      // Separator
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // Station items
      this._stationItems = [];
      for (const station of STATIONS) {
        const item = new PopupMenu.PopupMenuItem(station.label);
        item._stationKey = station.key;
        item.connect("activate", () => {
          this._selectStation(station.key);
          return Clutter.EVENT_STOP;
        });
        this.menu.addMenuItem(item);
        this._stationItems.push(item);
      }

      // Start/stop noise animation when menu opens/closes
      this.menu.connect("open-state-changed", (_menu, open) => {
        if (open && this._playing) this._startNoiseAnimation();
        else this._stopNoiseAnimation();
      });
    }

    _loadSettings() {
      const volume = this._settings.get_double("volume");
      const stationKey = this._settings.get_string("station");

      this._volumeSlider.value = volume;
      if (volume > 0) this._lastVolume = volume;
      this._currentStation = stationKey;
      this._updateStationOrnaments();
      this._updateGradient();
      this._updateMuteIcon();
    }

    _selectStation(key) {
      this._currentStation = key;
      this._settings.set_string("station", key);
      this._updateStationOrnaments();
      this._updateGradient();

      if (this._playing) {
        this._stop();
        this._play();
      }
    }

    _toggleMute() {
      if (this._volumeSlider.value > 0) {
        this._lastVolume = this._volumeSlider.value;
        this._volumeSlider.value = 0;
      } else {
        this._volumeSlider.value = this._lastVolume;
      }
    }

    _updateMuteIcon() {
      const vol = this._volumeSlider.value;
      let iconName;
      if (vol === 0) iconName = "audio-volume-muted-symbolic";
      else if (vol < 0.33) iconName = "audio-volume-low-symbolic";
      else if (vol < 0.66) iconName = "audio-volume-medium-symbolic";
      else iconName = "audio-volume-high-symbolic";
      this._muteButton.child.icon_name = iconName;
    }

    _updateGradient() {
      const grad = STATION_GRADIENTS[this._currentStation];
      if (!grad) return;
      this._gradientLayer.set_style(
        `background-gradient-direction: horizontal; ` +
          `background-gradient-start: ${grad.start}; ` +
          `background-gradient-end: ${grad.end};`,
      );
    }

    _startNoiseAnimation() {
      if (this._noiseTimerId) return;
      this._lastFlipX = 1;
      this._lastFlipY = 1;
      this._noiseTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
        let flipX, flipY;
        do {
          flipX = Math.random() > 0.5 ? -1 : 1;
          flipY = Math.random() > 0.5 ? -1 : 1;
        } while (flipX === this._lastFlipX && flipY === this._lastFlipY);
        this._lastFlipX = flipX;
        this._lastFlipY = flipY;
        this._noiseLayer.set_scale(flipX, flipY);
        return GLib.SOURCE_CONTINUE;
      });
    }

    _stopNoiseAnimation() {
      if (this._noiseTimerId) {
        GLib.Source.remove(this._noiseTimerId);
        this._noiseTimerId = 0;
      }
    }

    _updateStationOrnaments() {
      for (const item of this._stationItems) {
        item.setOrnament(
          item._stationKey === this._currentStation
            ? PopupMenu.Ornament.DOT
            : PopupMenu.Ornament.NONE,
        );
      }
    }

    _getStationUrl() {
      const station = STATIONS.find((s) => s.key === this._currentStation);
      return station ? station.url : STATIONS[0].url;
    }

    _createPipeline() {
      this._destroyPipeline();

      this._pipeline = Gst.ElementFactory.make("playbin", "nightride-player");
      if (!this._pipeline) {
        log("Nightride: failed to create playbin element");
        return false;
      }

      this._pipeline.set_property("volume", this._volumeSlider.value);

      const bus = this._pipeline.get_bus();
      bus.add_signal_watch();
      this._busWatchId = bus.connect("message::error", (_bus, msg) => {
        const [error, debug] = msg.parse_error();
        log(`Nightride: GStreamer error: ${error.message}`);
        log(`Nightride: debug: ${debug}`);
        this._stop();
        this._scheduleReconnect();
      });

      return true;
    }

    _destroyPipeline() {
      if (!this._pipeline) return;

      this._pipeline.set_state(Gst.State.NULL);

      if (this._busWatchId) {
        const bus = this._pipeline.get_bus();
        bus.disconnect(this._busWatchId);
        bus.remove_signal_watch();
        this._busWatchId = 0;
      }

      this._pipeline = null;
    }

    _play() {
      this._cancelReconnect();

      if (!this._createPipeline()) return;

      const url = this._getStationUrl();
      this._pipeline.set_property("uri", url);
      this._pipeline.set_state(Gst.State.PLAYING);
      this._playing = true;
      this._playButton.child.icon_name = "media-playback-stop-symbolic";
      if (this.menu.isOpen) this._startNoiseAnimation();
    }

    _stop() {
      this._cancelReconnect();
      this._destroyPipeline();
      this._playing = false;
      this._playButton.child.icon_name = "media-playback-start-symbolic";
      this._stopNoiseAnimation();
    }

    _scheduleReconnect() {
      this._cancelReconnect();
      this._reconnectTimeoutId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        5,
        () => {
          this._reconnectTimeoutId = 0;
          if (!this._playing) this._play();
          return GLib.SOURCE_REMOVE;
        },
      );
    }

    _cancelReconnect() {
      if (this._reconnectTimeoutId) {
        GLib.Source.remove(this._reconnectTimeoutId);
        this._reconnectTimeoutId = 0;
      }
    }

    destroy() {
      this._stopNoiseAnimation();
      this._stop();
      this._settings = null;
      super.destroy();
    }
  },
);

export default class NightrideExtension extends Extension {
  enable() {
    Gst.init(null);
    this._indicator = new NightrideIndicator(this);
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    this._indicator?.destroy();
    this._indicator = null;
  }
}
