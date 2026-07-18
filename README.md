# WidevineProxy2
An extension-based proxy for Widevine EME challenges and license messages. \
Modifies the challenge before it reaches the web player and retrieves the decryption keys from the response.

## What's Different in This Fork

This fork retains the upstream GPL-3.0 license and adds a subtitle-aware
command workflow:

- Captures unprotected HLS, DASH, and Smooth Streaming manifests too, including
  playlists requested directly by a native media player, and generates the same
  no-key downloader command for them. It also captures a direct `.mp4` only
  when it is explicitly assigned to a video element, never from segment traffic.
  Public HLS uses its master playlist when one is available and does not invoke
  Shaka Packager. Its expanded entry reports the manifest runtime when available;
  thumbnail VTT indexes and duplicate subtitle representations are excluded;
  when only a JW Player media playlist is exposed, it recovers the public master
  playlist so your requested quality can be selected; other providers fall back
  to the highest-bitrate playlist and remove only an incompatible resolution
  selector;
  protected streams continue through the existing key workflow.
- Detects actual external subtitle files from browser requests and
  subtitle-specific API or manifest data, retaining the request headers needed
  for short-lived authenticated links.
- Downloads verified external sidecars beside the video output, converts VTT
  files to SRT with `ffmpeg`, and uses Jellyfin-ready video-stem-plus-language
  names such as `Once.en_us.srt`, `Once.en_gb.srt`, or `Once.und.srt`.
- Collapses duplicate VTT/SRT representations of the same subtitle asset,
  preferring the browser-requested file.
- Shows clear external-subtitle progress and a final success message, and
  removes recognized N_m3u8DL-RE work folders only after all output succeeds.
- Keeps the Additional arguments field authoritative, so your N_m3u8DL-RE
  video, audio, subtitle, and muxing selections are preserved in the generated
  command.
- Refreshes existing displayed commands when Additional arguments change.
- Offers one optional macOS-only metadata/extras handoff, where you choose either
  the general Media Metadata and Extras Getter (MME) or the provider-focused
  Live Performance Metadata and Extras Getter (LPMAEG).
- Automatically supplies the captured original BroadwayHD detail-page URL to an
  enabled LPMAEG handoff when it matches `broadwayhd.com/video/<id>`; other
  providers continue to use the manual public detail-page link field.
- Refreshes the popup with a compact modern layout, light/dark styling,
  remembered collapsible settings cards, a unified media/metadata icon, and
  clearer captured-key controls.

See [CHANGELOG.md](CHANGELOG.md) for the complete, maintained record of fork
changes. New behavior is added here only after it has been verified.

## Features
+ User-friendly / GUI-based
+ Bypasses one-time tokens, hashes, and license wrapping
+ JavaScript native Widevine implementation
+ Supports Widevine Device files
+ Manifest V3 compliant

## Widevine Devices
This addon requires a Widevine Device file to work, which is not provided by this project.
+ Use an existing Remote CDM like [this one](https://github.com/user-attachments/files/21834836/remote.json)
+ Follow [this](https://forum.videohelp.com/threads/408031) guide if you want to dump your own device.
+ Ready-to-use Widevine Devices can be found on the [VideoHelp forum](https://forum.videohelp.com/forums/48).

## Compatibility
+ Compatible (tested) browsers: Firefox/Chrome on Windows/Linux, plus Firefox
  on macOS.
+ Verified macOS development environment: macOS Tahoe 26.5.2 with Firefox
  152.0.6. Current development and macOS verification for this fork are done
  on this configuration.
+ The core extension remains cross-platform. This fork's external-subtitle
  capture, download, conversion, naming, and cleanup workflow is currently
  supported on macOS only; it uses zsh, `curl`, `ffmpeg`, and N_m3u8DL-RE.
+ The optional LPMAEG handoff is also macOS-only at this time. It invokes the
  separately installed LPMAEG launcher through `python3` after successful output
  cleanup.
+ Works with any service that accepts challenges from Android devices on the same endpoint.

## Installation
+ Chrome
  1. Download the ZIP file from the [releases section](https://github.com/DevLARLEY/WidevineProxy2/releases)
  2. Navigate to `chrome://extensions/`
  3. Enable `Developer mode`
  4. Drag-and-drop the downloaded file into the window
+ Firefox
  + Persistent installation
    1. Download the XPI file from the [releases section](https://github.com/DevLARLEY/WidevineProxy2/releases)
    2. Navigate to `about:addons`
    3. Click the settings icon and choose `Install Add-on From File...`
    4. Select the downloaded file
  + Temporary installation
    1. Download the ZIP file from the [releases section](https://github.com/DevLARLEY/WidevineProxy2/releases)
    2. Navigate to `about:debugging#/runtime/this-firefox`
    3. Click `Load Temporary Add-on...` and select the downloaded file

## Setup
### Widevine Device
If you only have a `device_client_id_blob` and `device_private_key`, run this command to create a .wvd file:
```
pywidevine create-device -k device_private_key -c device_client_id_blob -t "ANDROID" -l 3
```
Now, open the extension, click `Choose File` and select your Widevine Device file.

### Remote CDM
If you don't already have a `remote.json` file, open the API URL in the browser (if provided) and save the response as `remote.json`. \
Now, open the extension, click `Choose remote.json` and select the JSON file provided by your API.


+ Select the type of device you're using in the top right-hand corner
+ The files are saved in the extension's `chrome.storage.sync` storage and will be synchronized across any browsers into which the user is signed in with their Google account.
+ The maximum number of Widevine devices is ~25 **OR** ~200 Remote CDMs
+ Check `Enabled` to activate the message interception and you're done.

## Usage
Play a video in the enabled extension. Protected playback records appear in
**Media and Keys** with a sparkle beside their URL and reveal the decryption
keys. Public playback appears without the sparkle and provides its manifest,
duration when available, and a no-key download command. \
Captured media and protected-stream key records are saved:
+ Temporarily until the extension is either refreshed manually (if installed temporarily) or a removal of the keys is manually initiated.
+ Permanently in the extension's `chrome.storage.local` storage until manually wiped or exported via the command line.
> [!NOTE]  
> The video will not play when the interception is active, as the Widevine CDM library isn't able to decrypt the Android CDM license.

+ Click the `+` button to expand a captured item. Protected media reveals the
  PSSH and keys; public media reveals its manifest and a no-key command.

### Optional Metadata and Extras Getter handoff (macOS only)

In **Metadata and Extras Getter**, select exactly one tool:

- **Media Metadata and Extras Getter (MME)** for general media providers; or
- **Live Performance Metadata and Extras Getter (LPMAEG)** for its supported
  live-performance providers.

Enable **Use**, then provide that getter's public detail-page link — not this
extension's stream or manifest URL — and its absolute project-folder path. The
selected getter runs after the N_m3u8DL-RE download, separately captured
subtitles, and work-folder cleanup. It receives the final output folder and uses
`--skip-existing`, so matching metadata or artwork is not overwritten.

For a BroadwayHD page whose original URL matches
`https://broadwayhd.com/video/<id>`, leave the public detail-page link blank.
When LPMAEG is selected, the extension recognises that provider-specific page
structure and supplies its captured original page URL automatically. The popup confirms this with
**BroadwayHD detail link auto added**; a manually entered link always takes
priority.

## FAQ
> What if I'm unable to get the keys?

This automatically means that the license server is blocking your CDM and that you either need a CDM from a physical device, a ChromeCDM, or an L1 Android CDM. Don't ask where you can get these

## Issues
+ DRM playback won't work when the extension is disabled and EME Logger is active. This is caused by my fix for dealing with EME Logger interference (solutions are welcome).

## Demo
[Widevineproxy2.webm](https://github.com/user-attachments/assets/8f51cee3-50e2-4aa4-b244-afa2d0b2987e)

## Disclaimer
+ This program is intended solely for educational purposes.
+ Do not use this program to decrypt or access any content for which you do not have the legal rights or explicit permission.
+ Unauthorized decryption or distribution of copyrighted materials is a violation of applicable laws and intellectual property rights.
+ This tool must not be used for any illegal activities, including but not limited to piracy, circumventing digital rights management (DRM), or unauthorized access to protected content.
+ The developers, contributors, and maintainers of this program are not responsible for any misuse or illegal activities performed using this software.
+ By using this program, you agree to comply with all applicable laws and regulations governing digital rights and copyright protections.

## Credits
+ [node-widevine](https://github.com/Frooastside/node-widevine)
+ [forge](https://github.com/digitalbazaar/forge)
+ [protobuf.js](https://github.com/protobufjs/protobuf.js)
