# Changelog

All notable changes to this fork are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Every user-visible change to this fork must add an entry under **Unreleased**
before it is committed.

## [Unreleased]

### Added

- Capture subtitle candidates observed in page network traffic, including
  separately requested subtitle URLs and subtitle URLs embedded in text
  responses.
- Preserve captured subtitle request headers with each URL so generated
  follow-up download commands can make the same authenticated request.
- Generate follow-up `curl` and `ffmpeg` commands for captured subtitles,
  converting temporary VTT downloads to SRT sidecars in the video output
  directory.
- Refresh already displayed generated commands when the Additional arguments
  setting changes.

- Document macOS Tahoe 26.5.2 with Firefox 152.0.6 as this fork's verified
  macOS development and test environment.

### Changed

- Include captured subtitle metadata with each selectable manifest so command
  generation can handle subtitle URLs found outside the manifest itself.
- Keep the user's Additional arguments as the authoritative N_m3u8DL-RE
  selection and muxing configuration.

### Fixed

- Prevent stale generated commands from being copied after command options are
  edited.
- Deduplicate externally captured subtitle URLs before follow-up commands are
  generated.

## [0.9.1] - 2026-07-15

### Fork baseline

- Fork baseline: `mp3li/WidevineProxy2-With-Extras` `main` at
  `801a7488f8c13f4847ed05ec701f150008976e8a`.
- This fork remains licensed under the GNU General Public License, version 3.0.
  The upstream `LICENSE` file is retained verbatim.

[Unreleased]: https://github.com/mp3li/WidevineProxy2-With-Extras/compare/801a7488f8c13f4847ed05ec701f150008976e8a...HEAD
[0.9.1]: https://github.com/mp3li/WidevineProxy2-With-Extras/tree/801a7488f8c13f4847ed05ec701f150008976e8a
