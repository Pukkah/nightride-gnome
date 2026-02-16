import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gst from 'gi://Gst';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const STATIONS = [
    {key: 'nightride', label: 'Nightride FM', url: 'https://stream.nightride.fm/nightride.mp3'},
    {key: 'chillsynth', label: 'Chillsynth FM', url: 'https://stream.nightride.fm/chillsynth.mp3'},
    {key: 'darksynth', label: 'Darksynth', url: 'https://stream.nightride.fm/darksynth.mp3'},
    {key: 'datawave', label: 'Datawave FM', url: 'https://stream.nightride.fm/datawave.mp3'},
    {key: 'spacesynth', label: 'Spacesynth FM', url: 'https://stream.nightride.fm/spacesynth.mp3'},
    {key: 'horrorsynth', label: 'Horrorsynth', url: 'https://stream.nightride.fm/horrorsynth.mp3'},
    {key: 'ebsm', label: 'EBSM', url: 'https://stream.nightride.fm/ebsm.mp3'},
];

const NightrideIndicator = GObject.registerClass(
class NightrideIndicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.0, 'Nightride FM');

        this._ext = ext;
        this._settings = ext.getSettings();
        this._playing = false;
        this._pipeline = null;
        this._busWatchId = 0;
        this._reconnectTimeoutId = 0;
        this._signalIds = [];

        // Panel icon
        const iconPath = ext.path + '/icons/nightride-symbolic.svg';
        const gicon = Gio.icon_new_for_string(iconPath);
        this._icon = new St.Icon({
            gicon,
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._buildMenu();
        this._loadSettings();
    }

    _buildMenu() {
        // Volume slider
        const volumeItem = new PopupMenu.PopupBaseMenuItem({activate: false});
        const volumeIcon = new St.Icon({
            icon_name: 'audio-volume-medium-symbolic',
            style_class: 'popup-menu-icon',
        });
        volumeItem.add_child(volumeIcon);

        this._volumeSlider = new Slider.Slider(0.5);
        this._volumeSlider.add_style_class_name('nightride-volume-slider');
        volumeItem.add_child(this._volumeSlider);

        this._volumeSlider.connect('notify::value', () => {
            const vol = this._volumeSlider.value;
            this._settings.set_double('volume', vol);
            if (this._pipeline)
                this._pipeline.set_property('volume', vol);
        });

        this.menu.addMenuItem(volumeItem);

        // Play/Stop button
        this._playItem = new PopupMenu.PopupMenuItem('Play');
        this._playItem.connect('activate', () => {
            if (this._playing)
                this._stop();
            else
                this._play();
            return Clutter.EVENT_STOP;
        });
        this.menu.addMenuItem(this._playItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Station items
        this._stationItems = [];
        for (const station of STATIONS) {
            const item = new PopupMenu.PopupMenuItem(station.label);
            item._stationKey = station.key;
            item.connect('activate', () => {
                this._selectStation(station.key);
                return Clutter.EVENT_STOP;
            });
            this.menu.addMenuItem(item);
            this._stationItems.push(item);
        }
    }

    _loadSettings() {
        const volume = this._settings.get_double('volume');
        const stationKey = this._settings.get_string('station');

        this._volumeSlider.value = volume;
        this._currentStation = stationKey;
        this._updateStationOrnaments();
    }

    _selectStation(key) {
        this._currentStation = key;
        this._settings.set_string('station', key);
        this._updateStationOrnaments();

        if (this._playing) {
            this._stop();
            this._play();
        }
    }

    _updateStationOrnaments() {
        for (const item of this._stationItems) {
            item.setOrnament(
                item._stationKey === this._currentStation
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE
            );
        }
    }

    _getStationUrl() {
        const station = STATIONS.find(s => s.key === this._currentStation);
        return station ? station.url : STATIONS[0].url;
    }

    _createPipeline() {
        this._destroyPipeline();

        this._pipeline = Gst.ElementFactory.make('playbin', 'nightride-player');
        if (!this._pipeline) {
            log('Nightride: failed to create playbin element');
            return false;
        }

        this._pipeline.set_property('volume', this._volumeSlider.value);

        const bus = this._pipeline.get_bus();
        bus.add_signal_watch();
        this._busWatchId = bus.connect('message::error', (_bus, msg) => {
            const [error, debug] = msg.parse_error();
            log(`Nightride: GStreamer error: ${error.message}`);
            log(`Nightride: debug: ${debug}`);
            this._stop();
            this._scheduleReconnect();
        });

        return true;
    }

    _destroyPipeline() {
        if (!this._pipeline)
            return;

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

        if (!this._createPipeline())
            return;

        const url = this._getStationUrl();
        this._pipeline.set_property('uri', url);
        this._pipeline.set_state(Gst.State.PLAYING);
        this._playing = true;
        this._playItem.label.text = 'Stop';
    }

    _stop() {
        this._cancelReconnect();
        this._destroyPipeline();
        this._playing = false;
        this._playItem.label.text = 'Play';
    }

    _scheduleReconnect() {
        this._cancelReconnect();
        this._reconnectTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            this._reconnectTimeoutId = 0;
            if (!this._playing)
                this._play();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelReconnect() {
        if (this._reconnectTimeoutId) {
            GLib.Source.remove(this._reconnectTimeoutId);
            this._reconnectTimeoutId = 0;
        }
    }

    destroy() {
        this._stop();
        this._settings = null;
        super.destroy();
    }
});

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
