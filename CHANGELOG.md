# Changelog

All notable changes to this fork are documented in this file.

This changelog documents changes made by the mp3li fork. For changes prior to the fork point, see the upstream project history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Every user-visible change to this fork must add an entry under **Unreleased**
before it is committed.

## [Unreleased]

### Added

- Capture public HLS, DASH, and Smooth Streaming manifest requests, including
  native media-player playlist traffic, and show a no-key download command in
  the same captured-media workflow.
- Capture direct public `.mp4` video-element sources without treating fMP4
  stream segments as standalone files.
- Report the detected runtime of public HLS, DASH, and Smooth Streaming media
  beside its generated command when the manifest provides enough information.
- Capture external subtitle files from browser traffic, including direct file
  requests and subtitle-specific API or manifest data.
- Preserve captured subtitle request headers with each URL so generated
  follow-up download commands can make the same authenticated request.
- Generate follow-up `curl` and `ffmpeg` commands for captured subtitles,
  converting temporary VTT downloads to SRT sidecars in the video output
  directory.
- Infer subtitle language from HLS, DASH, and structured API metadata, with
  URL-based language detection as a fallback.
- Name subtitle sidecars by language (`en.srt`, `fr.srt`); use `und.srt` for
  unknown languages and a numeric suffix for duplicate languages.
- Remove recognized N_m3u8DL-RE `master-<UUID>_<timestamp>` work directories
  after the video and every subtitle sidecar complete successfully.
- Refresh already displayed generated commands when the Additional arguments
  setting changes.
- Print mp3li subtitle-status notes after N_m3u8DL-RE completes, including a
  terminal spinner while separately captured subtitle files are downloaded,
  plus a final success message after cleanup.
- Document macOS Tahoe 26.5.2 with Firefox 152.0.6 as this fork's verified
  macOS development and test environment.
- Add an opt-in macOS/zsh handoff to the separately installed Live Performance
  Metadata and Extras Getter (LPMAEG), with local-only setup storage, a required
  public detail-page link, and safe existing-output skipping.
- Add a compact LPMAEG setup card directly below Command options, along with a
  modern light/dark popup layout and a new unified media/metadata toolbar and
  popup icon set.
- Add locally remembered Hide/Show controls for popup settings, device, command,
  and LPMAEG cards, reducing scrolling without changing captured-key behavior.
- Rename captured subtitle sidecars to Jellyfin's video-stem-plus-language
  convention (for example, `Once.en_us.srt`) and preserve that association when
  the optional LPMAEG handoff renames a generic downloader video.
- Auto-use a captured BroadwayHD detail-page URL for the LPMAEG handoff when it
  matches `broadwayhd.com/video/<id>`, while retaining manual links for every
  other provider.

### Changed

- Mark protected captured streams with a compact sparkle beside their URL.
- Include captured subtitle metadata with each selectable manifest so command
  generation can handle subtitle URLs found outside the manifest itself.
- Keep the user's Additional arguments as the authoritative N_m3u8DL-RE
  selection and muxing configuration.
- Reuse the originating response headers when a subtitle URL is found inside
  an API response rather than requested directly by the page.
- Normalize three-letter language codes such as `eng-GB` to standard sidecar
  tags such as `en-gb`, and inspect additional API language-code and label
  fields before falling back to the subtitle URL.
- Run external `ffmpeg` subtitle conversion quietly, retaining error output
  while removing its banner, stream map, and progress noise after the main
  downloader reports completion.
- Prefer a directly observed browser request when VTT and SRT format variants
  describe the same subtitle asset; download a selected SRT directly and
  convert other supported subtitle formats to SRT.
- Clarify that the core extension remains cross-platform while this fork's
  external-subtitle workflow is currently supported on macOS only.
- Keep LPMAEG entirely standalone by making its integration an explicit,
  post-success generated-command handoff only.
- Clarify generated macOS command progress with subtitle completion and
  metadata/extras start messages, and use the same mp3li note prefix for the
  handoff result.

### Fixed

- Do not mistake media chunks beneath a Smooth Streaming `.ism` path for
  manifests; public capture now ignores those `.ts` segments.
- Prefer a captured public HLS master playlist over its child playlists and do
  not invoke Shaka Packager for public streams.
- When JW Player exposes only same-media child playlists, retain the
  highest-bitrate one and omit an incompatible resolution-based video selector.
- Recover JW Player's public master playlist from an observed child playlist so
  the user's requested resolution can select the closest available rendition.
- Remove the generated `master-<name>_<timestamp>` work folder after success,
  not only folders whose name begins with a UUID.
- Remove N_m3u8DL-RE's newer `manifest-<name>_<timestamp>` raw-playlist work
  folders after a successful command as well.
- Prevent stale generated commands from being copied after command options are
  edited.
- Exclude JW Player's thumbnail-image VTT index and collapse text-identical
  subtitle responses to one sidecar download.
- Deduplicate externally captured subtitle URLs before follow-up commands are
  generated.
- Avoid treating a subtitle-list API endpoint as a downloadable subtitle file
  when the response contains the actual subtitle URLs.
- Limit generated external downloads to known subtitle-file extensions in
  direct requests or subtitle-specific API/manifest fields.
- Prevent stale or duplicate external subtitle links from producing additional
  sidecars, stalled commands, or inaccurate subtitle counts.
- Prevent LPMAEG local configuration or removed log entries from being treated
  as newly captured key records in the popup.
- Restore the captured-key collapsed view so it shows only the URL until its
  `+` control is opened, without malformed partial input rows.
- Align expanded captured-key labels and their inputs/selects into consistent
  two-column rows for clearer scanning and copying.

## [0.9.1] - 2026-07-15

### Fork baseline

- Fork baseline: `mp3li/WidevineProxy2-With-Extras` `main` at
  `801a7488f8c13f4847ed05ec701f150008976e8a`.
- This fork remains licensed under the GNU General Public License, version 3.0.
  The upstream `LICENSE` file is retained verbatim.

[Unreleased]: https://github.com/mp3li/WidevineProxy2-With-Extras/compare/801a7488f8c13f4847ed05ec701f150008976e8a...HEAD
[0.9.1]: https://github.com/mp3li/WidevineProxy2-With-Extras/tree/801a7488f8c13f4847ed05ec701f150008976e8a
