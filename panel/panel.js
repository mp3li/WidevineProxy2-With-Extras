import { AsyncLocalStorage, DeviceManager, RemoteCDMManager, SettingsManager, Util } from "../lib/util.js";

const key_container = document.getElementById('key-container');

// ================ Main ================
const enabled = document.getElementById('enabled');
enabled.addEventListener('change', async function (){
    await SettingsManager.setEnabled(enabled.checked);
});

const toggle = document.getElementById('darkModeToggle');
toggle.addEventListener('change', async () => {
    SettingsManager.setDarkMode(toggle.checked);
    await SettingsManager.saveDarkMode(toggle.checked);
});

const wvd_select = document.getElementById('wvd_select');
wvd_select.addEventListener('change', async function (){
    if (wvd_select.checked) {
        await SettingsManager.saveSelectedDeviceType("WVD");
    }
});

const remote_select = document.getElementById('remote_select');
remote_select.addEventListener('change', async function (){
    if (remote_select.checked) {
        await SettingsManager.saveSelectedDeviceType("REMOTE");
    }
});

const export_button = document.getElementById('exportLogs');
export_button.addEventListener('click', async function() {
    const logs = await AsyncLocalStorage.getStorage(null);
    SettingsManager.downloadFile(new Blob([JSON.stringify(logs)], { type: "application/json;charset=utf-8" }), "logs.json");
});

const clear_logs = document.getElementById('clearLogs');
clear_logs.addEventListener('click', function() {
    AsyncLocalStorage.clearStorage();
});
// ======================================

// ================ Widevine Device ================
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('click', () => {
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
        chrome.runtime.sendMessage({ type: "OPEN_PICKER_WVD_MOBILE" });
    } else {
        chrome.runtime.sendMessage({ type: "OPEN_PICKER_WVD" });
    }
    window.close();
});

const remove = document.getElementById('remove');
remove.addEventListener('click', async function() {
    await DeviceManager.removeSelectedWidevineDevice();
    wvd_combobox.innerHTML = '';
    await DeviceManager.loadSetAllWidevineDevices();
    const selected_option = wvd_combobox.options[wvd_combobox.selectedIndex];
    if (selected_option) {
        await DeviceManager.saveSelectedWidevineDevice(selected_option.text);
    } else {
        await DeviceManager.removeSelectedWidevineDeviceKey();
    }
});

const download = document.getElementById('download');
download.addEventListener('click', async function() {
    const widevine_device = await DeviceManager.getSelectedWidevineDevice();
    SettingsManager.downloadFile(
        Util.b64.decode(await DeviceManager.loadWidevineDevice(widevine_device)),
        widevine_device + ".wvd"
    )
});

const wvd_combobox = document.getElementById('wvd-combobox');
wvd_combobox.addEventListener('change', async function() {
    await DeviceManager.saveSelectedWidevineDevice(wvd_combobox.options[wvd_combobox.selectedIndex].text);
});
// =================================================

// ================ Remote CDM ================
document.getElementById('remoteInput').addEventListener('click', () => {
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
        chrome.runtime.sendMessage({ type: "OPEN_PICKER_REMOTE_MOBILE" });
    } else {
        chrome.runtime.sendMessage({ type: "OPEN_PICKER_REMOTE" });
    }
    window.close();
});

const remote_remove = document.getElementById('remoteRemove');
remote_remove.addEventListener('click', async function() {
    await RemoteCDMManager.removeSelectedRemoteCDM();
    remote_combobox.innerHTML = '';
    await RemoteCDMManager.loadSetAllRemoteCDMs();
    const selected_option = remote_combobox.options[remote_combobox.selectedIndex];
    if (selected_option) {
        await RemoteCDMManager.saveSelectedRemoteCDM(selected_option.text);
    } else {
        await RemoteCDMManager.removeSelectedRemoteCDMKey();
    }
});

const remote_download = document.getElementById('remoteDownload');
remote_download.addEventListener('click', async function() {
    const remote_cdm = await RemoteCDMManager.getSelectedRemoteCDM();
    SettingsManager.downloadFile(
        await RemoteCDMManager.loadRemoteCDM(remote_cdm),
        remote_cdm + ".json"
    )
});

const remote_combobox = document.getElementById('remote-combobox');
remote_combobox.addEventListener('change', async function() {
    await RemoteCDMManager.saveSelectedRemoteCDM(remote_combobox.options[remote_combobox.selectedIndex].text);
});
// ============================================

// ================ Command Options ================
const use_shaka = document.getElementById('use-shaka');
use_shaka.addEventListener('change', async function (){
    await SettingsManager.saveUseShakaPackager(use_shaka.checked);
});

const use_single_quotes = document.getElementById('use-single-quotes');
use_single_quotes.addEventListener('change', async function (){
    await SettingsManager.saveUseSingleQuotes(use_single_quotes.checked);
});

const downloader_name = document.getElementById('downloader-name');
downloader_name.addEventListener('input', async function (){
    await SettingsManager.saveExecutableName(downloader_name.value);
});

const downloader_args = document.getElementById('downloader-args');
downloader_args.addEventListener('input', async function (){
    await SettingsManager.saveAdditionalArguments(downloader_args.value);
    await refreshGeneratedCommands();
});
// =================================================

// ================ Keys ================
const clear = document.getElementById('clear');
clear.addEventListener('click', async function() {
    chrome.runtime.sendMessage({ type: "CLEAR" });
    key_container.innerHTML = "";
});

function formatHeaders(headers, option, quoteChar, safeQuoteChar) {
    return Object.entries(headers || {}).map(
        ([key, value]) => `${option} ${quoteChar}${key}: ${String(value).replaceAll(quoteChar, safeQuoteChar)}${quoteChar}`
    ).join(' ');
}

function getOutputDirectory(additionalArgs) {
    const saveDirMatch = String(additionalArgs || '').match(
        /(?:^|\s)--save-dir(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/
    );

    return saveDirMatch ? (saveDirMatch[1] || saveDirMatch[2] || saveDirMatch[3]) : '.';
}

function joinOutputPath(outputDirectory, filename) {
    return outputDirectory === '.' ? filename : `${outputDirectory.replace(/[\\/]+$/, '')}/${filename}`;
}

const languageCodeAliases = {
    ara: 'ar', bul: 'bg', cat: 'ca', ces: 'cs', chi: 'zh', cze: 'cs', dan: 'da',
    deu: 'de', dut: 'nl', ell: 'el', eng: 'en', fin: 'fi', fra: 'fr', fre: 'fr',
    ger: 'de', gre: 'el', heb: 'he', hin: 'hi', hrv: 'hr', hun: 'hu', ind: 'id',
    ita: 'it', jpn: 'ja', kor: 'ko', msa: 'ms', nld: 'nl', nor: 'no', pol: 'pl',
    por: 'pt', ron: 'ro', rum: 'ro', rus: 'ru', slk: 'sk', slo: 'sk', spa: 'es',
    srp: 'sr', swe: 'sv', tha: 'th', tur: 'tr', ukr: 'uk', vie: 'vi', zho: 'zh',
};

function normalizeSubtitleLanguage(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().replace(/_/g, '-').toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) {
        return null;
    }

    const [primary, ...subtags] = normalized.split('-');
    return [languageCodeAliases[primary] || primary, ...subtags].join('-');
}

function getSubtitleLanguage(subtitle) {
    const capturedLanguage = normalizeSubtitleLanguage(subtitle.language);
    if (capturedLanguage) {
        return capturedLanguage;
    }

    try {
        const parsed = new URL(subtitle.url);
        for (const key of [
            'language', 'lang', 'locale', 'srclang', 'subtitle_language', 'subtitleLanguage',
            'languageCode', 'language_code', 'localeCode', 'locale_code', 'iso', 'isoCode', 'iso_code',
        ]) {
            const language = normalizeSubtitleLanguage(parsed.searchParams.get(key));
            if (language) {
                return language;
            }
        }

        const nonLanguagePathTokens = new Set([
            'api', 'caption', 'captions', 'dtt', 'dfxp', 'manifest', 'master', 'mpd',
            'srt', 'sub', 'subs', 'subtitle', 'subtitles', 'track', 'tracks', 'ttml', 'vtt',
        ]);
        const pathLanguageMatches = [...decodeURIComponent(parsed.pathname).matchAll(
            /(?:^|[._/-])([a-z]{2,3}(?:[-_][a-z0-9]{2,8})?)(?=[._/-]|$)/gi
        )].reverse();
        for (const match of pathLanguageMatches) {
            const language = normalizeSubtitleLanguage(match[1]);
            if (language && !nonLanguagePathTokens.has(language)) {
                return language;
            }
        }
    } catch {
        // An invalid URL cannot produce a usable language hint.
    }

    return 'und';
}

function createSubtitleSpinnerFunction() {
    return [
        'mp3li_subtitle_spinner() {',
        'local pid="$1" message="$2" frame_index=0 frame;',
        'while kill -0 "$pid" 2>/dev/null; do',
        'case $((frame_index % 4)) in 0) frame="|" ;; 1) frame="/" ;; 2) frame="-" ;; *) frame="\\\\" ;; esac;',
        'printf "\\rmp3li note: %s %s" "$message" "$frame";',
        'frame_index=$((frame_index + 1)); sleep 0.1;',
        'done;',
        'printf "\\r\\033[K\\n\\n";',
        '}',
    ].join(' ');
}

function isSubtitleFileUrl(value) {
    return /\.(?:srt|vtt|webvtt|dtt|ttml|dfxp|ass|ssa)(?:[?#]|$)/i.test(value || '');
}

function getSubtitleAssetIdentity(subtitle) {
    try {
        const parsed = new URL(subtitle.url);
        const match = parsed.pathname.match(
            /^(.*)\/(?:srt|vtt|webvtt)\/(.+)-\d{10,}\.(?:srt|vtt|webvtt)$/i
        );
        return match ? `${parsed.origin}${match[1]}/${match[2]}` : subtitle.url;
    } catch {
        return subtitle.url;
    }
}

function getSubtitlePreference(subtitle) {
    if (subtitle.observedDirectly) {
        return 100;
    }
    return /\.(?:vtt|webvtt)(?:[?#]|$)/i.test(subtitle.url) ? 10
        : /\.srt(?:[?#]|$)/i.test(subtitle.url) ? 9
            : 0;
}

function getUniqueSubtitleFiles(subtitles) {
    const selected = new Map();
    for (const subtitle of subtitles || []) {
        if (!subtitle?.url || !isSubtitleFileUrl(subtitle.url)) {
            continue;
        }

        const assetIdentity = getSubtitleAssetIdentity(subtitle);
        const existing = selected.get(assetIdentity);
        if (!existing || getSubtitlePreference(subtitle) > getSubtitlePreference(existing)) {
            selected.set(assetIdentity, subtitle);
        }
    }
    return [...selected.values()];
}

function createExternalSubtitleCommands(subtitles, outputDirectory, quoteChar, safeQuoteChar) {
    const uniqueSubtitles = getUniqueSubtitleFiles(subtitles);

    const languageOccurrences = new Map();
    return uniqueSubtitles.map((subtitle, index) => {
        const language = getSubtitleLanguage(subtitle);
        const occurrence = (languageOccurrences.get(language) || 0) + 1;
        languageOccurrences.set(language, occurrence);

        const subtitleName = occurrence === 1
            ? `${language}.srt`
            : `${language}-${String(occurrence).padStart(2, '0')}.srt`;
        const temporaryFile = joinOutputPath(outputDirectory, `.${subtitleName}.vtt`);
        const outputFile = joinOutputPath(outputDirectory, subtitleName);
        const headers = formatHeaders(subtitle.headers, '-H', quoteChar, safeQuoteChar);
        const sourceIsSrt = /\.srt(?:[?#]|$)/i.test(subtitle.url);

        const curlCommand = [
            'curl --fail --location --silent --show-error --connect-timeout 20 --max-time 120',
            headers,
            `--output ${quoteChar}${sourceIsSrt ? outputFile : temporaryFile}${quoteChar}`,
            `${quoteChar}${subtitle.url}${quoteChar}`,
        ].filter(Boolean).join(' ');
        const downloadCommand = [
            curlCommand,
            sourceIsSrt ? '' : '&&',
            sourceIsSrt ? '' : `ffmpeg -hide_banner -loglevel error -nostats -y -i ${quoteChar}${temporaryFile}${quoteChar} ${quoteChar}${outputFile}${quoteChar}`,
            sourceIsSrt ? '' : '&&',
            sourceIsSrt ? '' : `rm -f ${quoteChar}${temporaryFile}${quoteChar}`,
        ].filter(Boolean).join(' ');

        const subtitleCount = uniqueSubtitles.length;
        const statusMessage = `Downloading... (${index + 1}/${subtitleCount})`;
        const logFile = joinOutputPath(outputDirectory, `.${subtitleName}.download.log`);
        return [
            '() {',
            'emulate -L zsh;',
            'setopt no_monitor;',
            `local mp3li_subtitle_log=${quoteChar}${logFile}${quoteChar} mp3li_subtitle_job;`,
            `( ${downloadCommand} ) > "$mp3li_subtitle_log" 2>&1 &`,
            'mp3li_subtitle_job=$!;',
            `mp3li_subtitle_spinner "$mp3li_subtitle_job" ${quoteChar}${statusMessage}${quoteChar};`,
            'if wait "$mp3li_subtitle_job"; then rm -f "$mp3li_subtitle_log"; else cat "$mp3li_subtitle_log" >&2; rm -f "$mp3li_subtitle_log"; return 1; fi;',
            '}',
        ].join(' ');
    });
}

function createSubtitleStatusCommand(subtitleCount, quoteChar) {
    const scopeNote = 'mp3li note: If above reported 0 subtitle streams above, that count only reflects manifest tracks. This fork also checks separately observed subtitle requests.';
    const resultNote = subtitleCount > 0
        ? `mp3li note: ${subtitleCount} ${subtitleCount === 1 ? 'subtitle' : 'subtitles'} found. Downloading...`
        : 'mp3li note: No separately captured subtitle files were found.';
    return `printf '\\n%s\\n\\n%s\\n\\n' ${quoteChar}${scopeNote}${quoteChar} ${quoteChar}${resultNote}${quoteChar}`;
}

function createWorkDirectoryCleanupCommand(outputDirectory, quoteChar) {
    const workDirectoryPattern = 'master-????????-????-????-????-????????????_????-??-??_??-??-??';
    return [
        'find',
        `${quoteChar}${outputDirectory}${quoteChar}`,
        '-type d',
        `-name ${quoteChar}${workDirectoryPattern}${quoteChar}`,
        '-prune -exec rm -rf {} +',
    ].join(' ');
}

function createCompletionCommand(quoteChar) {
    return `printf '\\n%s\\n' ${quoteChar}mp3li note: Complete. Output is ready.${quoteChar}`;
}

async function createCommand(json, key_string) {
    const metadata = JSON.parse(json);

    // Based on user choice in the panel, we have the quote character that should be used in the command,
    // and a safe quote character that can be used to format the header values.
    const useSingleQuotes = await SettingsManager.getUseSingleQuotes();
    const quoteChar = useSingleQuotes ? "'" : '"';
    const safeQuoteChar = useSingleQuotes ? '"' : "'";
    const headerString = formatHeaders(metadata.headers, '-H', quoteChar, safeQuoteChar);

    const executableName = await SettingsManager.getExecutableName();
    const useShaka = await SettingsManager.getUseShakaPackager();
    const additionalArgs = await SettingsManager.getAdditionalArguments();
    // Keep the user's downloader arguments as the source of truth. In
    // particular, do not add or rewrite subtitle selectors here.
    const commandParts = [
        executableName,
        `${quoteChar}${metadata.url}${quoteChar}`,
        headerString,
        key_string,
        useShaka ? "--use-shaka-packager" : "",
        additionalArgs,
    ].filter(Boolean);

    const videoCommand = commandParts.join(' ');
    const subtitleCommands = createExternalSubtitleCommands(
        metadata.subtitles,
        getOutputDirectory(additionalArgs),
        quoteChar,
        safeQuoteChar
    );
    const subtitleCount = subtitleCommands.length;
    const subtitleStatusCommand = createSubtitleStatusCommand(subtitleCount, quoteChar);
    const subtitleSpinnerFunction = subtitleCommands.length > 0 ? createSubtitleSpinnerFunction() : '';
    const cleanupCommand = createWorkDirectoryCleanupCommand(getOutputDirectory(additionalArgs), quoteChar);
    const completionCommand = createCompletionCommand(quoteChar);

    return [
        videoCommand,
        subtitleStatusCommand,
        subtitleSpinnerFunction,
        ...subtitleCommands,
        cleanupCommand,
        completionCommand,
    ].filter(Boolean).join(' && ');
}

async function refreshGeneratedCommands() {
    for (const logContainer of key_container.querySelectorAll('.log-container')) {
        const command = logContainer.querySelector('#command');
        const manifest = logContainer.querySelector('#manifest');
        const keys = logContainer.querySelector('.key-copy input');

        if (command && manifest && keys) {
            command.value = await createCommand(manifest.value, keys.value);
        }
    }
}

async function appendLog(result) {
    const key_string = result.keys.map(key => `--key ${key.kid}:${key.k}`).join(' ');
    const date = new Date(result.timestamp * 1000);
    const date_string = date.toLocaleString();

    const logContainer = document.createElement('div');
    logContainer.classList.add('log-container');
    logContainer.innerHTML = `
        <button class="toggleButton">+</button>
        <div class="expandableDiv collapsed">
            <label class="always-visible right-bound">
                URL:<input type="text" class="text-box" value="${result.url}">
            </label>
            <label class="expanded-only right-bound">
            <label class="expanded-only right-bound">
                PSSH:<input type="text" class="text-box" value="${result.pssh_data}">
            </label>
            <label class="expanded-only right-bound key-copy">
                <a href="#" title="Click to copy">Keys:</a><input type="text" class="text-box" value="${key_string}">
            </label>
            <label class="expanded-only right-bound">
                Date:<input type="text" class="text-box" value="${date_string}">
            </label>
            ${result.manifests.length > 0 ? `<label class="expanded-only right-bound manifest-copy">
                <a href="#" title="Click to copy">Manifest:</a><select id="manifest" class="text-box"></select>
            </label>
            <label class="expanded-only right-bound command-copy">
                <a href="#" title="Click to copy">Cmd:</a><input type="text" id="command" class="text-box">
            </label>` : ''}
        </div>`;

    const keysInput = logContainer.querySelector('.key-copy');
    keysInput.addEventListener('click', () => {
        navigator.clipboard.writeText(key_string);
    });

    if (result.manifests.length > 0) {
        const command = logContainer.querySelector('#command');

        const select = logContainer.querySelector("#manifest");
        select.addEventListener('change', async () => {
            command.value = await createCommand(select.value, key_string);
        });
        result.manifests.forEach((manifest) => {
            const option = new Option(
                `[${manifest.type}] ${manifest.url}`,
                JSON.stringify({ ...manifest, subtitles: result.subtitles || [] })
            );
            select.add(option);
        });
        command.value = await createCommand(select.value, key_string);

        const manifest_copy = logContainer.querySelector('.manifest-copy');
        manifest_copy.addEventListener('click', () => {
            navigator.clipboard.writeText(JSON.parse(select.value).url);
        });

        const command_copy = logContainer.querySelector('.command-copy');
        command_copy.addEventListener('click', () => {
            navigator.clipboard.writeText(command.value);
        });
    }

    const toggleButtons = logContainer.querySelector('.toggleButton');
    toggleButtons.addEventListener('click', function () {
        const expandableDiv = this.nextElementSibling;
        if (expandableDiv.classList.contains('collapsed')) {
            toggleButtons.innerHTML = "-";
            expandableDiv.classList.remove('collapsed');
            expandableDiv.classList.add('expanded');
        } else {
            toggleButtons.innerHTML = "+";
            expandableDiv.classList.remove('expanded');
            expandableDiv.classList.add('collapsed');
        }
    });

    key_container.appendChild(logContainer);
}

chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
        for (const [key, values] of Object.entries(changes)) {
            await appendLog(values.newValue);
        }
    }
});

function checkLogs() {
    chrome.runtime.sendMessage({ type: "GET_LOGS" }, (response) => {
        if (response) {
            response.forEach(async (result) => {
                await appendLog(result);
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    enabled.checked = await SettingsManager.getEnabled();
    SettingsManager.setDarkMode(await SettingsManager.getDarkMode());
    use_shaka.checked = await SettingsManager.getUseShakaPackager();
    use_single_quotes.checked = await SettingsManager.getUseSingleQuotes();
    downloader_name.value = await SettingsManager.getExecutableName();
    downloader_args.value = await SettingsManager.getAdditionalArguments();
    SettingsManager.setSelectedDeviceType(await SettingsManager.getSelectedDeviceType());
    await DeviceManager.loadSetAllWidevineDevices();
    await DeviceManager.selectWidevineDevice(await DeviceManager.getSelectedWidevineDevice());
    await RemoteCDMManager.loadSetAllRemoteCDMs();
    await RemoteCDMManager.selectRemoteCDM(await RemoteCDMManager.getSelectedRemoteCDM());
    checkLogs();
});
// ======================================
