(async () => {
    const proxy = (object, method, handler) => {
        const original = object[method];
        if (typeof original !== "function")
            return;

        Object.defineProperty(object, method, {
            value: new Proxy(original, { apply: handler }),
            configurable: true,
            writable: true
        });
    };

    const b64 = {
        decode: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
        encode: b => btoa(String.fromCharCode(...new Uint8Array(b)))
    };

    const getManifestType = (text) => {
        const lower = text.toLowerCase();
        if (lower.includes('<mpd') && lower.includes('</mpd>')) {
            return "DASH";
        } else if (lower.includes('#extm3u')) {
            if (lower.includes('#ext-x-stream-inf')) {
                return "HLS_MASTER";
            } else {
                return "HLS_PLAYLIST";
            }
        } else if (lower.includes('<smoothstreamingmedia') && lower.includes('</smoothstreamingmedia>')) {
            return "MSS";
        }
    }

    const subtitleContextPattern = /subtitle|subtitles|caption|captions|closed.?caption|\bcc\b/i;
    // Only follow a directly downloadable subtitle sidecar. Network requests
    // whose URL merely mentions "subtitle" are often API/metadata endpoints,
    // not a subtitle file that curl can save and ffmpeg can convert.
    const subtitleFilePattern = /\.(?:srt|vtt|webvtt|dtt|ttml|dfxp|ass|ssa)(?:[?#]|$)/i;
    const languageKeys = [
        "language", "lang", "locale", "srclang", "subtitle_language", "subtitleLanguage",
        "languageCode", "language_code", "localeCode", "locale_code", "iso", "isoCode", "iso_code",
    ];
    const languageTextKeys = ["label", "title", "name", "displayName", "display_name"];
    const languageCodeAliases = {
        ara: "ar", bul: "bg", cat: "ca", ces: "cs", chi: "zh", cze: "cs", dan: "da",
        deu: "de", dut: "nl", ell: "el", eng: "en", fin: "fi", fra: "fr", fre: "fr",
        ger: "de", gre: "el", heb: "he", hin: "hi", hrv: "hr", hun: "hu", ind: "id",
        ita: "it", jpn: "ja", kor: "ko", msa: "ms", nld: "nl", nor: "no", pol: "pl",
        por: "pt", ron: "ro", rum: "ro", rus: "ru", slk: "sk", slo: "sk", spa: "es",
        srp: "sr", swe: "sv", tha: "th", tur: "tr", ukr: "uk", vie: "vi", zho: "zh",
    };
    const nonLanguagePathTokens = new Set([
        "api", "caption", "captions", "dtt", "dfxp", "manifest", "master", "mpd",
        "srt", "sub", "subs", "subtitle", "subtitles", "track", "tracks", "ttml", "vtt",
    ]);

    const normalizeLanguage = (value) => {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.trim().replace(/_/g, "-").toLowerCase();
        if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) {
            return null;
        }

        const [primary, ...subtags] = normalized.split("-");
        return [languageCodeAliases[primary] || primary, ...subtags].join("-");
    };

    const getLanguageFromText = (value) => {
        const directLanguage = normalizeLanguage(value);
        if (directLanguage) {
            return directLanguage;
        }

        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.toLowerCase();
        const namedLanguages = [
            ["english", "en"], ["french", "fr"], ["spanish", "es"], ["german", "de"],
            ["italian", "it"], ["portuguese", "pt"], ["japanese", "ja"], ["korean", "ko"],
            ["chinese", "zh"], ["russian", "ru"], ["arabic", "ar"], ["dutch", "nl"],
            ["swedish", "sv"], ["norwegian", "no"], ["danish", "da"], ["finnish", "fi"],
            ["polish", "pl"], ["turkish", "tr"], ["ukrainian", "uk"], ["hebrew", "he"],
            ["greek", "el"], ["romanian", "ro"], ["czech", "cs"], ["hungarian", "hu"],
            ["bulgarian", "bg"], ["croatian", "hr"], ["serbian", "sr"], ["slovak", "sk"],
            ["vietnamese", "vi"], ["thai", "th"], ["indonesian", "id"], ["malay", "ms"],
        ];
        for (const [name, code] of namedLanguages) {
            if (normalized.includes(name)) {
                if (code === "en") {
                    if (/\b(?:gb|uk|british|great britain)\b/.test(normalized)) {
                        return "en-gb";
                    }
                    if (/\b(?:us|usa|american)\b/.test(normalized)) {
                        return "en-us";
                    }
                }
                if (code === "pt" && /\b(?:br|brazil|brazilian)\b/.test(normalized)) {
                    return "pt-br";
                }
                return code;
            }
        }

        const languageMatch = normalized.match(/\b([a-z]{2,3}(?:[-_][a-z0-9]{2,8})?)\b/i);
        if (languageMatch) {
            return normalizeLanguage(languageMatch[1]);
        }

        return null;
    };

    const getLanguageFromUrl = (value) => {
        try {
            const parsed = new URL(value, window.location.href);

            for (const key of languageKeys) {
                const language = getLanguageFromText(parsed.searchParams.get(key));
                if (language) {
                    return language;
                }
            }

            const pathLanguageMatches = [...decodeURIComponent(parsed.pathname).matchAll(
                /(?:^|[._/-])([a-z]{2,3}(?:[-_][a-z0-9]{2,8})?)(?=[._/-]|$)/gi
            )].reverse();
            for (const match of pathLanguageMatches) {
                const language = normalizeLanguage(match[1]);
                if (language && !nonLanguagePathTokens.has(match[1].toLowerCase())) {
                    return language;
                }
            }
        } catch {
            // Ignore malformed URLs; they are not usable command inputs.
        }

        return null;
    };

    const isSubtitleFileUrl = (value) => subtitleFilePattern.test(value || "");

    const addSubtitleCandidate = (
        candidates,
        url,
        language = null,
        sourceUrl = window.location.href,
        observedDirectly = false
    ) => {
        if (!url || typeof url !== "string") {
            return;
        }

        let resolvedUrl;
        try {
            resolvedUrl = new URL(url, sourceUrl).href;
        } catch {
            return;
        }

        if (!isSubtitleFileUrl(resolvedUrl)) {
            return;
        }

        const existing = candidates.get(resolvedUrl);
        const resolvedLanguage = getLanguageFromText(language) || getLanguageFromUrl(resolvedUrl);
        if (!existing
            || (!existing.language && resolvedLanguage)
            || (observedDirectly && !existing.observedDirectly)) {
            candidates.set(resolvedUrl, {
                url: resolvedUrl,
                language: resolvedLanguage || existing?.language || null,
                observedDirectly: observedDirectly || existing?.observedDirectly || false,
            });
        }
    };

    const getObjectLanguage = (value) => {
        for (const key of languageKeys) {
            const language = getLanguageFromText(value?.[key]);
            if (language) {
                return language;
            }
        }

        for (const key of languageTextKeys) {
            const language = getLanguageFromText(value?.[key]);
            if (language) {
                return language;
            }
        }

        return null;
    };

    const extractSubtitleUrlsFromJson = (
        value,
        candidates,
        sourceUrl,
        inheritedLanguage = null,
        subtitleContext = false
    ) => {
        if (Array.isArray(value)) {
            value.forEach((item) => extractSubtitleUrlsFromJson(item, candidates, sourceUrl, inheritedLanguage, subtitleContext));
            return;
        }

        if (!value || typeof value !== "object") {
            return;
        }

        const language = getObjectLanguage(value) || inheritedLanguage;
        const objectContext = subtitleContext || subtitleContextPattern.test(
            [value.type, value.kind, value.role, value.label, value.name].filter(Boolean).join(" ")
        );

        for (const [key, item] of Object.entries(value)) {
            const keyContext = objectContext || subtitleContextPattern.test(key);
            if (typeof item === "string" && /url|uri|src|href|file|link/i.test(key)) {
                if (keyContext && isSubtitleFileUrl(item)) {
                    addSubtitleCandidate(candidates, item, language, sourceUrl);
                }
                continue;
            }

            extractSubtitleUrlsFromJson(item, candidates, sourceUrl, language, keyContext);
        }
    };

    const extractSubtitleUrlsFromText = (text, sourceUrl, candidates) => {
        const hlsMediaRegex = /#EXT-X-MEDIA:([^\r\n]+)/gi;
        for (const match of text.matchAll(hlsMediaRegex)) {
            const attributes = match[1];
            if (!/TYPE=SUBTITLES/i.test(attributes)) {
                continue;
            }

            const uriMatch = attributes.match(/(?:^|,)URI=(?:"([^"]+)"|([^,]+))/i);
            const languageMatch = attributes.match(/(?:^|,)LANGUAGE=(?:"([^"]+)"|([^,]+))/i);
            if (uriMatch) {
                try {
                    addSubtitleCandidate(candidates, uriMatch[1] || uriMatch[2], languageMatch?.[1] || languageMatch?.[2], sourceUrl);
                } catch {
                    // Ignore a malformed playlist URI.
                }
            }
        }

        const dashAdaptationSetRegex = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
        for (const match of text.matchAll(dashAdaptationSetRegex)) {
            const attributes = match[1];
            const content = match[2];
            if (!/contentType=["']text["']|mimeType=["'][^"']*(?:ttml|vtt|subtitle)|codecs=["'][^"']*(?:stpp|wvtt)/i.test(attributes)) {
                continue;
            }

            const languageMatch = attributes.match(/\blang=["']([^"']+)["']/i);
            const baseUrlMatch = content.match(/<BaseURL>([^<]+)<\/BaseURL>/i);
            if (baseUrlMatch) {
                try {
                    addSubtitleCandidate(candidates, baseUrlMatch[1], languageMatch?.[1], sourceUrl);
                } catch {
                    // Ignore a malformed MPD BaseURL.
                }
            }
        }
    };

    async function emitSubtitleIfNeeded(url, body) {
        const candidates = new Map();
        let sourceUrl = url;
        try {
            sourceUrl = new URL(url, window.location.href).href;
        } catch {
            // addSubtitleCandidate will reject unusable URL values below.
        }

        // JW Player uses VTT as an image-sprite index for preview thumbnails.
        // It has VTT timing syntax but is not a subtitle track.
        if (isImageSpriteVtt(sourceUrl, body)) {
            return;
        }

        const directSubtitleContentIdentity = isSubtitleFileUrl(sourceUrl)
            ? getSubtitleContentIdentity(body)
            : null;

        if (url && isSubtitleFileUrl(url)) {
            addSubtitleCandidate(candidates, url, null, sourceUrl, true);
        }

        if (body) {
            extractSubtitleUrlsFromText(body, sourceUrl, candidates);
            try {
                extractSubtitleUrlsFromJson(JSON.parse(body), candidates, sourceUrl);
            } catch {
                // Non-JSON responses are handled by the playlist/text parsers above.
            }
        }

        for (const candidate of candidates.values()) {
            await emitAndWaitForResponse("SUBTITLE", JSON.stringify({
                ...candidate,
                sourceUrl,
                contentIdentity: candidate.observedDirectly && candidate.url === sourceUrl
                    ? directSubtitleContentIdentity
                    : null,
            }));
        }
    }

    function isImageSpriteVtt(url, body) {
        return /\/strips\//i.test(url || '')
            || /\.(?:jpe?g|png|webp)#xywh=/i.test(body || '');
    }

    function getSubtitleContentIdentity(body) {
        if (typeof body !== 'string' || body.length === 0 || body.length > 1_000_000) {
            return null;
        }

        // Compare cue text rather than container formatting: the same track
        // often appears once as SRT and once as WEBVTT with different timing
        // punctuation and cue numbering.
        const normalized = body
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line
                && !/^\uFEFF?WEBVTT/i.test(line)
                && !/^X-TIMESTAMP-MAP/i.test(line)
                && !/^\d+$/.test(line)
                && !/-->/.test(line)
            )
            .join('\n');
        if (!normalized) {
            return null;
        }

        let hash = 0x811c9dc5;
        for (let index = 0; index < normalized.length; index += 1) {
            hash ^= normalized.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
        return `fnv1a-${(hash >>> 0).toString(16)}-${normalized.length}`;
    }

    const getManifestDurationSeconds = (text, manifestType) => {
        if (manifestType === 'HLS_MASTER') {
            return null;
        }

        if (manifestType === 'HLS_PLAYLIST') {
            const durations = [...text.matchAll(/#EXTINF:([0-9]+(?:\.[0-9]+)?)/gi)]
                .map((match) => Number.parseFloat(match[1]));
            const total = durations.reduce((sum, duration) => sum + duration, 0);
            return total > 0 ? Math.round(total) : null;
        }

        if (manifestType === 'DASH') {
            const duration = text.match(/\bmediaPresentationDuration=["']P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?["']/i);
            if (duration) {
                const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = duration;
                return Math.round(Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds));
            }
        }

        if (manifestType === 'MSS') {
            const root = text.match(/<SmoothStreamingMedia\b([^>]*)>/i)?.[1] || '';
            const duration = root.match(/\bDuration=["'](\d+)["']/i)?.[1];
            const timeScale = root.match(/\bTimeScale=["'](\d+)["']/i)?.[1] || '10000000';
            if (duration && Number(timeScale) > 0) {
                return Math.round(Number(duration) / Number(timeScale));
            }
        }

        return null;
    };

    const getHlsMasterDurationSeconds = async (text, sourceUrl) => {
        const lines = text.split(/\r?\n/);
        const variantUrls = [];
        for (let index = 0; index < lines.length; index += 1) {
            if (!/^#EXT-X-STREAM-INF:/i.test(lines[index])) {
                continue;
            }
            const uri = lines.slice(index + 1).find((line) => line.trim() && !line.startsWith('#'));
            if (uri) {
                variantUrls.push(new URL(uri.trim(), sourceUrl).href);
            }
        }

        for (const variantUrl of variantUrls) {
            try {
                const response = await fetch(variantUrl, { credentials: 'include' });
                if (!response.ok) {
                    continue;
                }
                const duration = getManifestDurationSeconds(await response.text(), 'HLS_PLAYLIST');
                if (duration) {
                    return duration;
                }
            } catch {
                // Try the next variant, or leave the duration unavailable.
            }
        }
        return null;
    };

    const getDetectedManifestDuration = async (text, manifestType, sourceUrl) => {
        const directDuration = getManifestDurationSeconds(text, manifestType);
        return directDuration || (manifestType === 'HLS_MASTER'
            ? getHlsMasterDurationSeconds(text, sourceUrl)
            : null);
    };

    const capturedDirectVideoUrls = new Set();

    const emitDirectVideoIfNeeded = async (url) => {
        if (!url || capturedDirectVideoUrls.has(url)) {
            return;
        }

        try {
            const resolvedUrl = new URL(url, window.location.href).href;
            if (!new URL(resolvedUrl).pathname.toLowerCase().endsWith('.mp4')) {
                return;
            }
            capturedDirectVideoUrls.add(resolvedUrl);
            await emitAndWaitForResponse("DIRECT_VIDEO", JSON.stringify({ url: resolvedUrl }));
        } catch {
            // Ignore non-URL values such as a MediaSource blob URL.
        }
    };

    const inspectVideoElement = (video) => {
        emitDirectVideoIfNeeded(video.currentSrc || video.src);
        video.querySelectorAll?.('source[src]').forEach((source) => emitDirectVideoIfNeeded(source.src));
    };

    const inspectDirectVideoSources = (node) => {
        if (!(node instanceof Element)) {
            return;
        }
        if (node instanceof HTMLVideoElement) {
            inspectVideoElement(node);
        }
        node.querySelectorAll?.('video').forEach(inspectVideoElement);
        if (node instanceof HTMLSourceElement && node.parentElement instanceof HTMLVideoElement) {
            emitDirectVideoIfNeeded(node.src);
        }
    };

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                inspectDirectVideoSources(mutation.target);
            } else {
                mutation.addedNodes.forEach(inspectDirectVideoSources);
            }
        }
    }).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
    });

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('video').forEach(inspectVideoElement);
    });

    function emitAndWaitForResponse(type, data) {
        return new Promise((resolve) => {
            const requestId = Math.random().toString(16).substring(2, 9);
            const responseHandler = (event) => {
                const { detail } = event;
                if (detail.substring(0, 7) === requestId) {
                    document.removeEventListener('responseReceived', responseHandler);
                    resolve(detail.substring(7));
                }
            };
            document.addEventListener('responseReceived', responseHandler);
            const requestEvent = new CustomEvent('response', {
                detail: {
                    type: type,
                    body: data,
                    requestId: requestId,
                }
            });
            document.dispatchEvent(requestEvent);
        });
    }

    if (typeof EventTarget !== 'undefined') {
        proxy(EventTarget.prototype, 'addEventListener', (target, thisArg, args) => {
            const [type, listener] = args;

            if (thisArg == null || typeof MediaKeySession === 'undefined' || !(thisArg instanceof MediaKeySession) || typeof MediaKeyMessageEvent === 'undefined' || type !== "message" || !listener) {
                return target.apply(thisArg, args);
            }

            args[1] = async function(event) {
                if (event instanceof MediaKeyMessageEvent && event.isTrusted && event.message.byteLength > 2) {
                    const oldChallenge = b64.encode(event.message);
                    const newChallenge = await emitAndWaitForResponse("REQUEST", oldChallenge);

                    const clonedEvent = new MediaKeyMessageEvent("message", {
                        messageType: event.messageType,
                        message: b64.decode(newChallenge).buffer
                    });

                    event.stopImmediatePropagation();
                    event.preventDefault();

                    thisArg.dispatchEvent(clonedEvent);
                    return;
                }

                if (listener.handleEvent) {
                    listener.handleEvent.call(listener, event);
                } else {
                    listener.call(this, event);
                }
            };

            return target.apply(thisArg, args);
        });
    }

    if (typeof MediaKeySession !== 'undefined') {
        proxy(MediaKeySession.prototype, 'update', async (target, thisArg, args) => {
            if (thisArg == null || !(thisArg instanceof MediaKeySession)) {
                return target.apply(thisArg, args);
            }

            await emitAndWaitForResponse("RESPONSE", b64.encode(args[0]))

            try {
                return await target.apply(thisArg, args);
            } catch (e) {
                // ignored, since this will always fail
            }
        });
    }

    proxy(XMLHttpRequest.prototype,  "open", (target, thisArg, args) => {
        const [method, url] = args;

        thisArg.requestMethod = method.toUpperCase();
        thisArg.requestURL = url;

        return target.apply(thisArg, args);
    });

    proxy(XMLHttpRequest.prototype, "send", (target, thisArg, args) => {
        thisArg.addEventListener("readystatechange", async () => {
            if (thisArg.requestMethod !== "GET" || thisArg.readyState !== 4) {
                return;
            }

            let body = null;
            switch (thisArg.responseType) {
                case "":
                case "text":
                    body = thisArg.responseText ?? thisArg.response;
                    break;

                case "json":
                    body = typeof thisArg.response === 'string' ? thisArg.response : JSON.stringify(thisArg.response);
                    break;

                case "arraybuffer":
                    if (thisArg.response && thisArg.response.byteLength > 0 && thisArg.response.byteLength < 1_000_000) {
                        const arr = new Uint8Array(thisArg.response);
                        const decoder = new TextDecoder('utf-8', { fatal: false });
                        body = arr.length <= 2000
                            ? decoder.decode(arr)
                            : decoder.decode(arr.slice(0, 1000)) + decoder.decode(arr.slice(-1000));
                    }
                    break;

                case "blob":
                    if (thisArg.response.type.startsWith('text/') || thisArg.response.type.includes('xml') || thisArg.response.type.includes('json') || thisArg.response.size < 100_000) {
                        body = await thisArg.response.text();
                    }
                    break;

                case "document":
                    if (thisArg.response?.documentElement) {
                        body = new XMLSerializer().serializeToString(thisArg.response);
                    }
                    break;
            }

            if (body) {
                const manifest_type = getManifestType(body);
                if (manifest_type) {
                    console.log("WVP2 FOUND MANIFEST", manifest_type, thisArg.responseURL);
                    await emitAndWaitForResponse("MANIFEST", JSON.stringify({
                        url: thisArg.responseURL,
                        type: manifest_type,
                        durationSeconds: await getDetectedManifestDuration(body, manifest_type, thisArg.responseURL),
                    }));
                }

                await emitSubtitleIfNeeded(thisArg.responseURL, body);
            }
        });

        return target.apply(thisArg, args);
    });

    proxy(window, "fetch", async (target, thisArg, args) => {
        const response = await target.apply(thisArg, args);

        try {
            if (response) {
                const text = await response.clone().text();
                const manifest_type = getManifestType(text);

                if (manifest_type) {
                    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;

                    if (url) {
                        await emitAndWaitForResponse("MANIFEST", JSON.stringify({
                            url,
                            type: manifest_type,
                            durationSeconds: await getDetectedManifestDuration(text, manifest_type, url),
                        }));
                    }
                }

                const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
                await emitSubtitleIfNeeded(url, text);
            }
        } catch (err) {
            console.debug("Manifest intercept failed:", err);
        }

        return response;
    });
})();
