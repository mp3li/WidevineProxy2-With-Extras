import "./lib/protobuf.min.js";
import "./lib/license_protocol.min.js";
const { LicenseType, SignedMessage, LicenseRequest, License } = protobuf.roots.default.license_protocol;

import "./lib/forge.min.js";

import { Session } from "./lib/cdm.js";
import { DeviceManager, SettingsManager, AsyncLocalStorage, RemoteCDMManager, IconManager, Util } from "./lib/util.js";
import { WidevineDevice } from "./lib/device.js";
import { RemoteCdm } from "./lib/remote_cdm.js";


let manifests = new Map();
let subtitles = new Map();
let requests = new Map();
let sessions = new Map();
let logs = [];
const subtitleCaptureWindowMs = 60 * 1000;
// Give an HLS master a moment to expose a media playlist and its duration
// before presenting the single public-media entry.
const publicManifestCaptureDelayMs = 3000;
let protectedPages = new Map();
let queuedPublicManifests = new Map();
let capturedPublicManifests = new Set();
let jwMasterRecoveries = new Map();

function getManifestTypeFromUrl(url) {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        if (pathname.endsWith(".m3u8")) {
            return "HLS_PLAYLIST";
        }
        if (pathname.endsWith(".mpd")) {
            return "DASH";
        }
        // A Smooth Streaming manifest ends at `*.ism/Manifest`. Do not match
        // the `.ts` chunks that happen to live beneath the same `.ism` path.
        if (/\.ism\/manifest$/i.test(pathname)) {
            return "MSS";
        }
    } catch {
        // A malformed URL cannot be a usable media manifest.
    }
    return null;
}

function addManifest(tabUrl, manifest) {
    if (!tabUrl) {
        return;
    }

    const elements = manifests.get(tabUrl) || [];
    const existing = elements.find((element) => element.url === manifest.url);
    if (existing) {
        existing.headers = manifest.headers || existing.headers;
        existing.durationSeconds = manifest.durationSeconds || existing.durationSeconds || null;
        // The URL-only network observer sees every HLS file as a playlist.
        // Preserve the body-aware HLS master classification when it arrives.
        if (manifest.type === "HLS_MASTER" || existing.type !== "HLS_MASTER") {
            existing.type = manifest.type || existing.type;
        }
    } else {
        elements.push(manifest);
        manifests.set(tabUrl, elements);
    }
}

function getLongestManifestDuration(tabUrl) {
    return (manifests.get(tabUrl) || []).reduce((longest, manifest) =>
        Math.max(longest, Number(manifest.durationSeconds) || 0), 0
    ) || null;
}

function getHlsMediaIdentity(url) {
    try {
        return new URL(url).pathname.match(/\/media\/([^/]+)\//i)?.[1] || null;
    } catch {
        return null;
    }
}

function getHlsPlaylistBitrate(url) {
    try {
        const filename = new URL(url).pathname.split('/').pop() || '';
        return Number(filename.match(/=(\d+)\.m3u8$/i)?.[1]) || 0;
    } catch {
        return 0;
    }
}

async function recoverJwPlayerMaster(tabUrl, mediaId, headers) {
    const identity = `${tabUrl}\n${mediaId}`;
    if (!jwMasterRecoveries.has(identity)) {
        jwMasterRecoveries.set(identity, (async () => {
            try {
                const response = await fetch(`https://cdn.jwplayer.com/v2/media/${encodeURIComponent(mediaId)}`);
                if (!response.ok) {
                    return false;
                }
                const metadata = await response.json();
                const item = metadata?.playlist?.[0];
                const masterUrl = item?.sources?.find((source) =>
                    source?.type === 'application/vnd.apple.mpegurl' && typeof source.file === 'string'
                )?.file;
                if (!masterUrl) {
                    return false;
                }

                addManifest(tabUrl, {
                    type: 'HLS_MASTER',
                    url: masterUrl,
                    durationSeconds: Number(item.duration) || null,
                    headers: headers || {},
                });
                queuePublicManifest(tabUrl, {
                    type: 'HLS_MASTER',
                    url: masterUrl,
                    durationSeconds: Number(item.duration) || null,
                    headers: headers || {},
                });
                return true;
            } catch {
                return false;
            }
        })());
    }
    const recovered = await jwMasterRecoveries.get(identity);
    if (!recovered) {
        jwMasterRecoveries.delete(identity);
    }
    return recovered;
}

function queuePublicManifest(tabUrl, manifest) {
    if (!tabUrl || !manifest?.url) {
        return;
    }

    const identity = `${tabUrl}\n${manifest.url}`;
    if (capturedPublicManifests.has(identity) || queuedPublicManifests.has(identity)) {
        return;
    }

    const observedAt = Date.now();
    const timer = setTimeout(async () => {
        queuedPublicManifests.delete(identity);
        if (protectedPages.get(tabUrl) >= observedAt || capturedPublicManifests.has(identity)) {
            return;
        }

        const currentManifests = manifests.get(tabUrl) || [];
        const currentManifest = currentManifests.find((element) => element.url === manifest.url) || manifest;
        // A master playlist is the usable public entry. Its child playlists
        // are not separate videos and can carry stream-selection restrictions.
        if (currentManifest.type === "HLS_PLAYLIST"
            && currentManifests.some((element) => element.type === "HLS_MASTER")) {
            return;
        }

        const mediaIdentity = getHlsMediaIdentity(currentManifest.url);
        const isHlsPlaylistFallback = currentManifest.type === "HLS_PLAYLIST" && !currentManifests.some(
            (element) => element.type === "HLS_MASTER"
        );
        if (isHlsPlaylistFallback && mediaIdentity) {
            // JW Player's CDN child playlists contain no rendition list. Its
            // public media record supplies the master, so the user's existing
            // resolution preference can choose the closest available quality.
            if (await recoverJwPlayerMaster(tabUrl, mediaIdentity, currentManifest.headers)) {
                return;
            }
        }
        if (isHlsPlaylistFallback && mediaIdentity) {
            const currentBitrate = getHlsPlaylistBitrate(currentManifest.url);
            const hasHigherBitrateSibling = currentManifests.some((element) =>
                element.type === "HLS_PLAYLIST"
                && getHlsMediaIdentity(element.url) === mediaIdentity
                && getHlsPlaylistBitrate(element.url) > currentBitrate
            );
            if (hasHigherBitrateSibling) {
                return;
            }
        }

        const log = {
            type: "PUBLIC",
            url: tabUrl,
            timestamp: Math.floor(Date.now() / 1000),
            durationSeconds: getLongestManifestDuration(tabUrl),
            manifests: [{
                ...currentManifest,
                isHlsPlaylistFallback,
                headers: requests.get(currentManifest.url) || currentManifest.headers || {},
            }],
            subtitles: getSubtitlesNearTime(tabUrl, Date.now())
        };
        capturedPublicManifests.add(identity);
        logs.push(log);
        await AsyncLocalStorage.setStorage({[`public:${encodeURIComponent(identity)}`]: log});
        IconManager.setNotificationIcon();
    }, publicManifestCaptureDelayMs);
    queuedPublicManifests.set(identity, timer);
}

function markPageProtected(tabUrl) {
    if (!tabUrl) {
        return;
    }
    protectedPages.set(tabUrl, Date.now());
}

function getSubtitleIdentity(subtitle) {
    try {
        const url = new URL(subtitle.url);
        // Signed CDN URLs for the same sidecar can be requested more than once
        // with fresh query values. Keep the latest usable request, rather than
        // emitting multiple downloads for the same file.
        return `${url.origin}${url.pathname}`;
    } catch {
        return subtitle.url;
    }
}

function getSubtitlesNearTime(tabUrl, timestampMs) {
    return (subtitles.get(tabUrl) || []).filter((subtitle) =>
        Math.abs((subtitle.capturedAt || 0) - timestampMs) <= subtitleCaptureWindowMs
    );
}

function observeManifestRequest(details) {
    const type = getManifestTypeFromUrl(details.url);
    if (!type || details.tabId < 0) {
        return;
    }

    SettingsManager.getEnabled().then(async (enabled) => {
        if (!enabled) {
            return;
        }

        let tabUrl = "";
        try {
            // Match the top-level page URL used by the content-script path,
            // even when a player makes its media request from an iframe.
            tabUrl = (await chrome.tabs.get(details.tabId)).url || "";
        } catch {
            tabUrl = details.documentUrl || details.initiator || "";
        }
        if (!tabUrl) {
            return;
        }

        const manifest = {
            type,
            url: details.url,
            headers: requests.get(details.url) || {},
        };
        addManifest(tabUrl, manifest);
        queuePublicManifest(tabUrl, manifest);
    }).catch(() => {
        // A request can outlive the extension's service worker state.
    });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        if (details.method === "GET") {
            if (!requests.has(details.url)) {
                const headers = details.requestHeaders
                    .filter(item => !(
                        item.name.startsWith('sec-ch-ua') ||
                        item.name.startsWith('Sec-Fetch') ||
                        item.name.startsWith('Accept-') ||
                        item.name.startsWith('Host') ||
                        item.name === "Connection"
                    )).reduce((acc, item) => {
                        acc[item.name] = item.value;
                        return acc;
                    }, {});
                requests.set(details.url, headers);
            }
            // Native media playback does not necessarily use fetch or XHR, so
            // observe playlist requests here as well as in the page hooks.
            observeManifestRequest(details);
        }
    },
    {urls: ["<all_urls>"]},
    ['requestHeaders', chrome.webRequest.OnSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);

async function parseClearKey(body, sendResponse, tab_url) {
    markPageProtected(tab_url);
    const clearkey = JSON.parse(atob(body));

    const formatted_keys = clearkey["keys"].map(key => ({
        ...key,
        kid: Util.bytesToHex(Util.b64.decode(key.kid.replace(/-/g, "+").replace(/_/g, "/") + "==")),
        k: Util.bytesToHex(Util.b64.decode(key.k.replace(/-/g, "+").replace(/_/g, "/") + "=="))
    }));
    const pssh_data = btoa(JSON.stringify({kids: clearkey["keys"].map(key => key.k)}));

    if (logs.filter(log => log.pssh_data === pssh_data).length > 0) {
        console.log("[WidevineProxy2]", `KEYS_ALREADY_RETRIEVED: ${pssh_data}`);
        sendResponse();
        return;
    }

    console.log("[WidevineProxy2]", "CLEARKEY KEYS", formatted_keys, tab_url);
    const log = {
        type: "CLEARKEY",
        pssh_data: pssh_data,
        keys: formatted_keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : [],
        subtitles: getSubtitlesNearTime(tab_url, Date.now())
    }
    logs.push(log);

    await AsyncLocalStorage.setStorage({[pssh_data]: log});
    subtitles.delete(tab_url);
    sendResponse();
}

async function generateChallenge(body, sendResponse) {
    const signed_message =  SignedMessage.decode(Util.b64.decode(body));
    const license_request = LicenseRequest.decode(signed_message.msg);
    const pssh_data = license_request.contentId.widevinePsshData.psshData[0];

    if (!pssh_data) {
        console.log("[WidevineProxy2]", "NO_PSSH_DATA_IN_CHALLENGE");
        sendResponse(body);
        return;
    }

    if (logs.filter(log => log.pssh_data === Session.psshDataToPsshBoxB64(pssh_data)).length > 0) {
        console.log("[WidevineProxy2]", `KEYS_ALREADY_RETRIEVED: ${Util.b64.encode(pssh_data)}`);
        sendResponse(body);
        return;
    }

    const selected_device_name = await DeviceManager.getSelectedWidevineDevice();
    if (!selected_device_name) {
        sendResponse(body);
        return;
    }

    const device_b64 = await DeviceManager.loadWidevineDevice(selected_device_name);
    const widevine_device = new WidevineDevice(Util.b64.decode(device_b64).buffer);

    const private_key = `-----BEGIN RSA PRIVATE KEY-----${Util.b64.encode(widevine_device.private_key)}-----END RSA PRIVATE KEY-----`;
    const session = new Session(
        {
            privateKey: private_key,
            identifierBlob: widevine_device.client_id_bytes
        },
        pssh_data
    );

    const [challenge, request_id] = session.createLicenseRequest(LicenseType.STREAMING, widevine_device.type === 2);
    sessions.set(Util.b64.encode(request_id), session);

    sendResponse(Util.b64.encode(challenge));
}

async function parseLicense(body, sendResponse, tab_url) {
    markPageProtected(tab_url);
    const license = Util.b64.decode(body);
    const signed_license_message = SignedMessage.decode(license);

    if (signed_license_message.type !== SignedMessage.MessageType.LICENSE) {
        sendResponse();
        return;
    }

    const license_obj = License.decode(signed_license_message.msg);
    const loaded_request_id = Util.b64.encode(license_obj.id.requestId);

    if (!sessions.has(loaded_request_id)) {
        sendResponse();
        return;
    }

    const loadedSession = sessions.get(loaded_request_id);
    const keys = await loadedSession.parseLicense(license);
    const pssh = loadedSession.getPSSH();

    console.log("[WidevineProxy2]", "KEYS", JSON.stringify(keys), tab_url);
    const log = {
        type: "WIDEVINE",
        pssh_data: pssh,
        keys: keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : [],
        subtitles: getSubtitlesNearTime(tab_url, Date.now())
    }
    logs.push(log);
    await AsyncLocalStorage.setStorage({[pssh]: log});
    IconManager.setNotificationIcon();

    subtitles.delete(tab_url);
    sessions.delete(loaded_request_id);
    sendResponse();
}

async function generateChallengeRemote(body, sendResponse) {
    const signed_message =  SignedMessage.decode(Util.b64.decode(body));
    const license_request = LicenseRequest.decode(signed_message.msg);
    const pssh_data = license_request.contentId.widevinePsshData.psshData[0];

    if (!pssh_data) {
        console.log("[WidevineProxy2]", "NO_PSSH_DATA_IN_CHALLENGE");
        sendResponse(body);
        return;
    }

    const pssh = Session.psshDataToPsshBoxB64(pssh_data);

    if (logs.filter(log => log.pssh_data === pssh).length > 0) {
        console.log("[WidevineProxy2]", `KEYS_ALREADY_RETRIEVED: ${Util.b64.encode(pssh_data)}`);
        sendResponse(body);
        return;
    }

    const selected_remote_cdm_name = await RemoteCDMManager.getSelectedRemoteCDM();
    if (!selected_remote_cdm_name) {
        sendResponse(body);
        return;
    }

    const selected_remote_cdm = JSON.parse(await RemoteCDMManager.loadRemoteCDM(selected_remote_cdm_name));
    const remote_cdm = RemoteCdm.from_object(selected_remote_cdm);

    const session_id = await remote_cdm.open();
    const challenge_b64 = await remote_cdm.get_license_challenge(session_id, pssh, true);

    const signed_challenge_message = SignedMessage.decode(Util.b64.decode(challenge_b64));
    const challenge_message = LicenseRequest.decode(signed_challenge_message.msg);

    sessions.set(Util.b64.encode(challenge_message.contentId.widevinePsshData.requestId), {
        id: session_id,
        pssh: pssh
    });
    sendResponse(challenge_b64);
}

async function parseLicenseRemote(body, sendResponse, tab_url) {
    markPageProtected(tab_url);
    const license = Util.b64.decode(body);
    const signed_license_message = SignedMessage.decode(license);

    if (signed_license_message.type !== SignedMessage.MessageType.LICENSE) {
        sendResponse();
        return;
    }

    const license_obj = License.decode(signed_license_message.msg);
    const loaded_request_id = Util.b64.encode(license_obj.id.requestId);

    if (!sessions.has(loaded_request_id)) {
        sendResponse();
        return;
    }

    const session_id = sessions.get(loaded_request_id);

    const selected_remote_cdm_name = await RemoteCDMManager.getSelectedRemoteCDM();
    if (!selected_remote_cdm_name) {
        sendResponse();
        return;
    }

    const selected_remote_cdm = JSON.parse(await RemoteCDMManager.loadRemoteCDM(selected_remote_cdm_name));
    const remote_cdm = RemoteCdm.from_object(selected_remote_cdm);

    await remote_cdm.parse_license(session_id.id, body);
    const returned_keys = await remote_cdm.get_keys(session_id.id, "CONTENT");
    await remote_cdm.close(session_id.id);

    if (returned_keys.length === 0) {
        sendResponse();
        return;
    }

    const keys = returned_keys.map(({ key, key_id }) => ({ k: key, kid: key_id }));

    console.log("[WidevineProxy2]", "KEYS", JSON.stringify(keys), tab_url);
    const log = {
        type: "WIDEVINE",
        pssh_data: session_id.pssh,
        keys: keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : [],
        subtitles: getSubtitlesNearTime(tab_url, Date.now())
    }
    logs.push(log);
    await AsyncLocalStorage.setStorage({[session_id.pssh]: log});

    subtitles.delete(tab_url);
    sessions.delete(loaded_request_id);
    sendResponse();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        const tab_url = sender.tab ? sender.tab.url : null;

        switch (message.type) {
            case "REQUEST":
                if (!await SettingsManager.getEnabled()) {
                    sendResponse(message.body);
                    manifests.clear();
                    subtitles.clear();
                    return;
                }

                // An EME challenge is definitive protected-playback activity.
                // Mark it before the license round trip so a slow server cannot
                // briefly publish the same manifest as a public stream.
                markPageProtected(tab_url);

                try {
                    JSON.parse(atob(message.body));
                    sendResponse(message.body);
                    return;
                } catch {
                    if (message.body) {
                        const device_type = await SettingsManager.getSelectedDeviceType();
                        switch (device_type) {
                            case "WVD":
                                await generateChallenge(message.body, sendResponse);
                                break;
                            case "REMOTE":
                                await generateChallengeRemote(message.body, sendResponse);
                                break;
                        }
                    }
                }
                break;

            case "RESPONSE":
                if (!await SettingsManager.getEnabled()) {
                    sendResponse(message.body);
                    manifests.clear();
                    subtitles.clear();
                    return;
                }

                try {
                    await parseClearKey(message.body, sendResponse, tab_url);
                    return;
                } catch (e) {
                    const device_type = await SettingsManager.getSelectedDeviceType();
                    switch (device_type) {
                        case "WVD":
                            await parseLicense(message.body, sendResponse, tab_url);
                            break;
                        case "REMOTE":
                            await parseLicenseRemote(message.body, sendResponse, tab_url);
                            break;
                    }
                    return;
                }
            case "GET_LOGS":
                sendResponse(logs);
                break;
            case "OPEN_PICKER_WVD":
                chrome.windows.create({
                    url: 'picker/wvd/filePicker.html',
                    type: 'popup',
                    width: 300,
                    height: 200,
                });
                break;
            case "OPEN_PICKER_WVD_MOBILE":
                chrome.tabs.create({
                    url: chrome.runtime.getURL("picker/wvd/filePicker.html")
                });
                break;
            case "OPEN_PICKER_REMOTE":
                chrome.windows.create({
                    url: 'picker/remote/filePicker.html',
                    type: 'popup',
                    width: 300,
                    height: 200,
                });
                break;
            case "OPEN_PICKER_REMOTE_MOBILE":
                chrome.tabs.create({
                    url: chrome.runtime.getURL("picker/remote/filePicker.html")
                });
                break;
            case "CLEAR":
                logs = [];
                manifests.clear();
                subtitles.clear();
                protectedPages.clear();
                queuedPublicManifests.forEach((timer) => clearTimeout(timer));
                queuedPublicManifests.clear();
                capturedPublicManifests.clear();
                jwMasterRecoveries.clear();
                IconManager.setDefaultIcon();
                break;
            case "MANIFEST":
                const parsed = JSON.parse(message.body);
                const element = {
                    type: parsed.type,
                    url: parsed.url,
                    durationSeconds: parsed.durationSeconds || null,
                    headers: requests.has(parsed.url) ? requests.get(parsed.url) : [],
                };
                addManifest(tab_url, element);
                queuePublicManifest(tab_url, element);
                sendResponse();
                break;
            case "DIRECT_VIDEO":
                const directVideo = JSON.parse(message.body);
                const directVideoElement = {
                    type: "DIRECT_MP4",
                    url: directVideo.url,
                    headers: requests.has(directVideo.url) ? requests.get(directVideo.url) : {},
                };
                addManifest(tab_url, directVideoElement);
                queuePublicManifest(tab_url, directVideoElement);
                sendResponse();
                break;
            case "SUBTITLE":
                const subtitleData = JSON.parse(message.body);
                const subtitleElement = {
                    url: subtitleData.url,
                    language: subtitleData.language || null,
                    observedDirectly: subtitleData.observedDirectly === true,
                    contentIdentity: subtitleData.contentIdentity || null,
                    capturedAt: Date.now(),
                    headers: requests.has(subtitleData.url)
                        ? requests.get(subtitleData.url)
                        : (requests.has(subtitleData.sourceUrl) ? requests.get(subtitleData.sourceUrl) : []),
                };

                if (!subtitles.has(tab_url)) {
                    subtitles.set(tab_url, [subtitleElement]);
                } else {
                    let elements = subtitles.get(tab_url);
                    const existingSubtitle = elements.find(
                        e => getSubtitleIdentity(e) === getSubtitleIdentity(subtitleElement)
                    );
                    if (!existingSubtitle) {
                        elements.push(subtitleElement);
                        subtitles.set(tab_url, elements);
                    } else {
                        existingSubtitle.url = subtitleElement.url;
                        existingSubtitle.headers = subtitleElement.headers;
                        existingSubtitle.language = subtitleElement.language || existingSubtitle.language;
                        existingSubtitle.observedDirectly ||= subtitleElement.observedDirectly;
                        existingSubtitle.contentIdentity ||= subtitleElement.contentIdentity;
                        existingSubtitle.capturedAt = subtitleElement.capturedAt;
                    }
                }
                sendResponse();
                break;
        }
    })();
    return true;
});

chrome.runtime.onSuspend.addListener(() => {
    IconManager.setDefaultIcon();
});
