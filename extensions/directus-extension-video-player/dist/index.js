import { useApi, defineInterface } from "@directus/extensions-sdk";
import { ref, computed, watch, onBeforeUnmount, defineComponent, resolveComponent, resolveDirective, openBlock, createElementBlock, createCommentVNode, createElementVNode, createVNode, toDisplayString, createTextVNode, Fragment, normalizeStyle, normalizeClass, withDirectives, withCtx, renderList } from "vue";

function formatFileSize(bytes) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = parseInt(bytes);
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex++; }
    return size.toFixed(unitIndex > 0 ? 1 : 0) + " " + units[unitIndex];
}

function formatDuration(seconds) {
    if (!seconds) return "";
    const t = Math.floor(seconds);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
}

function getFileIcon(type) {
    if (!type) return "insert_drive_file";
    if (type.startsWith("video/")) return "smart_display";
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("audio/")) return "audiotrack";
    if (type.includes("pdf")) return "picture_as_pdf";
    return "insert_drive_file";
}

const videoExtensions = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".avi", ".mkv", ".m4v"];
const audioExtensions = [".mp3", ".wav", ".aac", ".flac", ".m4a", ".wma", ".opus"];

const _sfc_main = defineComponent({
    name: "GcsMediaPlayer",
    props: {
        value: { type: [String, Object], default: null },
        disabled: { type: Boolean, default: false },
        collection: { type: String, default: null },
        field: { type: String, default: null },
        primaryKey: { type: [String, Number], default: null },
        autoplay: { type: Boolean, default: false },
        showControls: { type: Boolean, default: true },
        maxWidth: { type: String, default: "100%" },
        aspectRatio: { type: String, default: "16/9" }
    },
    emits: ["input"],
    setup(props, { emit }) {
        const api = useApi();
        const fileData = ref(null);
        const loading = ref(false);
        const mediaError = ref(null);
        const fileDrawerOpen = ref(false);
        const videoElement = ref(null);
        const audioElement = ref(null);
        const playbackState = ref("idle");
        const mediaBuffering = ref(true);
        const mediaMeta = ref({ duration: 0, width: 0, height: 0 });

        const fileList = ref([]);
        const filesLoading = ref(false);
        const searchQuery = ref("");
        const filePage = ref(1);
        const hasMore = ref(false);
        const fileLimit = 25;
        let searchTimeout = null;

        const fileId = computed(() => {
            if (!props.value) return null;
            if (typeof props.value === "string") return props.value;
            if (typeof props.value === "object" && props.value.id) return props.value.id;
            return null;
        });

        const isVideoFile = computed(() => {
            if (!fileData.value) return false;
            const type = fileData.value.type || "";
            if (type.startsWith("video/")) return true;
            const fn = (fileData.value.filename_download || "").toLowerCase();
            return videoExtensions.some(e => fn.endsWith(e));
        });

        const isAudioFile = computed(() => {
            if (!fileData.value) return false;
            const type = fileData.value.type || "";
            if (type.startsWith("audio/")) return true;
            const fn = (fileData.value.filename_download || "").toLowerCase();
            return audioExtensions.some(e => fn.endsWith(e));
        });

        const isMediaFile = computed(() => isVideoFile.value || isAudioFile.value);

        const mediaUrl = computed(() => {
            if (!fileId.value) return null;
            if (!isMediaFile.value) return null;
            return "/assets/" + fileId.value;
        });

        const headerIcon = computed(() => isAudioFile.value ? "audiotrack" : "smart_display");

        const containerStyle = computed(() => ({ "--max-width": props.maxWidth || "100%" }));
        const videoWrapperStyle = computed(() => ({ aspectRatio: props.aspectRatio || "16/9" }));

        const playbackStatusLabel = computed(() => {
            const labels = { idle: "Listo", playing: "\u25B6 Reproduciendo", paused: "\u23F8 Pausado", ended: "\u23F9 Finalizado" };
            return labels[playbackState.value] || "Listo";
        });

        function openFileDrawer() {
            if (props.disabled) return;
            fileDrawerOpen.value = true;
            filePage.value = 1;
            searchQuery.value = "";
            fetchFileList();
        }
        function selectFile(file) { emit("input", file.id); fileDrawerOpen.value = false; }

        async function fetchFileList() {
            filesLoading.value = true;
            try {
                const params = { fields: ["id", "title", "filename_download", "type", "filesize"], limit: fileLimit, page: filePage.value, sort: ["-uploaded_on"] };
                if (searchQuery.value) params.search = searchQuery.value;
                const response = await api.get("/files", { params });
                const files = response.data.data || [];
                if (filePage.value === 1) fileList.value = files;
                else fileList.value = [...fileList.value, ...files];
                hasMore.value = files.length === fileLimit;
            } catch (err) { fileList.value = []; } finally { filesLoading.value = false; }
        }
        function loadMore() { filePage.value++; fetchFileList(); }
        function onSearchInput() {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { filePage.value = 1; fetchFileList(); }, 300);
        }

        function clearFile() {
            emit("input", null);
            fileData.value = null;
            mediaError.value = null;
            playbackState.value = "idle";
            mediaMeta.value = { duration: 0, width: 0, height: 0 };
        }

        async function fetchFileData() {
            if (!fileId.value) { fileData.value = null; return; }
            loading.value = true;
            mediaError.value = null;
            mediaBuffering.value = true;
            try {
                const r = await api.get("/files/" + fileId.value, { params: { fields: ["id", "title", "filename_download", "type", "filesize", "width", "height", "duration", "storage"] } });
                fileData.value = r.data.data;
            } catch (err) { mediaError.value = "No se pudo cargar la información del archivo"; fileData.value = null; } finally { loading.value = false; }
        }

        function retryLoad() { mediaError.value = null; fetchFileData(); }
        function onCanPlay() { mediaBuffering.value = false; }
        function onVideoLoadedMetadata() {
            mediaBuffering.value = false;
            if (videoElement.value) { mediaMeta.value = { duration: videoElement.value.duration, width: videoElement.value.videoWidth, height: videoElement.value.videoHeight }; }
        }
        function onAudioLoadedMetadata() {
            mediaBuffering.value = false;
            if (audioElement.value) { mediaMeta.value = { duration: audioElement.value.duration, width: 0, height: 0 }; }
        }
        function onMediaError(event) {
            mediaBuffering.value = false;
            const el = event.target;
            const error = el && el.error;
            const msgs = { 1: "La carga fue abortada", 2: "Error de red", 3: "Error al decodificar", 4: "Formato no soportado" };
            mediaError.value = error ? (msgs[error.code] || "Error (código: " + error.code + ")") : "Error desconocido";
        }
        function onPlay() { playbackState.value = "playing"; }
        function onPause() { playbackState.value = "paused"; }
        function onEnded() { playbackState.value = "ended"; }

        watch(() => fileId.value, (newId) => { if (newId) fetchFileData(); else fileData.value = null; }, { immediate: true });

        onBeforeUnmount(() => {
            if (videoElement.value) { videoElement.value.pause(); videoElement.value.src = ""; videoElement.value.load(); }
            if (audioElement.value) { audioElement.value.pause(); audioElement.value.src = ""; audioElement.value.load(); }
            if (searchTimeout) clearTimeout(searchTimeout);
        });

        return {
            fileData, loading, mediaError, fileDrawerOpen, videoElement, audioElement, playbackState, mediaMeta, mediaBuffering,
            fileId, isVideoFile, isAudioFile, isMediaFile, mediaUrl, headerIcon, containerStyle, videoWrapperStyle, playbackStatusLabel,
            fileList, filesLoading, searchQuery, hasMore,
            openFileDrawer, selectFile, clearFile, fetchFileList, loadMore, onSearchInput,
            formatFileSize, formatDuration, getFileIcon,
            retryLoad, onCanPlay, onVideoLoadedMetadata, onAudioLoadedMetadata, onMediaError, onPlay, onPause, onEnded
        };
    }
});

// Inject CSS
const _style = `
.gcs-media-player{width:100%;max-width:var(--max-width,100%);font-family:var(--theme--fonts--sans--font-family,'Inter',system-ui,sans-serif)}
.gcs-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;border:2px dashed var(--theme--border-color,#e0e0e0);border-radius:var(--theme--border-radius,12px);cursor:pointer;transition:all .2s ease;background:var(--theme--background-subdued,#f7f7f7)}
.gcs-empty-state:hover{border-color:var(--theme--primary,#6644ff);background:var(--theme--primary-background,#f0ecff)}
.gcs-empty-icon{margin-bottom:12px;color:var(--theme--foreground-subdued,#999);transition:color .2s ease}
.gcs-empty-state:hover .gcs-empty-icon{color:var(--theme--primary,#6644ff)}
.gcs-empty-text{font-size:14px;font-weight:600;color:var(--theme--foreground,#333);margin:0 0 4px}
.gcs-empty-hint{font-size:12px;color:var(--theme--foreground-subdued,#999);margin:0}
.gcs-media-container{border:1px solid var(--theme--border-color,#e0e0e0);border-radius:var(--theme--border-radius,12px);overflow:hidden;background:var(--theme--background,#fff);box-shadow:0 1px 3px rgba(0,0,0,.06)}
.gcs-media-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--theme--border-color-subdued,#f0f0f0);background:var(--theme--background-subdued,#fafafa)}
.gcs-file-info{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.gcs-file-icon{color:var(--theme--primary,#6644ff);flex-shrink:0}
.gcs-file-details{display:flex;flex-direction:column;min-width:0}
.gcs-file-name{font-size:13px;font-weight:600;color:var(--theme--foreground,#333);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gcs-file-meta{font-size:11px;color:var(--theme--foreground-subdued,#999)}
.gcs-media-actions{display:flex;gap:4px;flex-shrink:0}
.gcs-video-wrapper{position:relative;width:100%;background:#000;display:flex;align-items:center;justify-content:center;min-height:200px;overflow:hidden}
.gcs-video-element{width:100%;height:100%;object-fit:contain;display:block}
.gcs-audio-wrapper{padding:0;background:var(--theme--background,#fff)}
.gcs-audio-player{display:flex;flex-direction:column;align-items:center;gap:0}
.gcs-audio-visual{display:flex;align-items:center;justify-content:center;padding:28px 20px 20px;width:100%;background:linear-gradient(135deg,var(--theme--primary-background,#f0ecff) 0%,var(--theme--background-subdued,#fafafa) 100%)}
.gcs-audio-icon-bg{width:72px;height:72px;border-radius:50%;background:var(--theme--primary,#6644ff);display:flex;align-items:center;justify-content:center;color:#fff;transition:all .3s ease;box-shadow:0 4px 16px rgba(102,68,255,.25)}
.gcs-audio-icon-bg.is-playing{animation:gcs-pulse-audio 2s ease-in-out infinite;box-shadow:0 4px 24px rgba(102,68,255,.4)}
@keyframes gcs-pulse-audio{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.gcs-audio-controls{width:100%;padding:12px 16px 16px}
.gcs-audio-element{width:100%;height:40px;border-radius:8px;outline:none}
.gcs-media-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:rgba(255,255,255,.8);padding:40px}
.gcs-media-loading p{margin:0;font-size:13px}
.gcs-audio-loading{color:var(--theme--foreground-subdued,#999);padding:30px}
.gcs-media-error{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px;color:var(--theme--danger,#e35169)}
.gcs-error-text{margin:0;font-size:13px;text-align:center;color:rgba(255,255,255,.9)}
.gcs-audio-error-state{padding:30px}
.gcs-audio-error-state .gcs-error-text{color:var(--theme--danger,#e35169)}
.gcs-not-media{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:40px;color:var(--theme--foreground-subdued,#999)}
.gcs-not-media p{margin:0;font-size:13px}
.gcs-not-media-type{font-size:11px;opacity:.6}
.gcs-media-buffering-overlay{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:2}
.gcs-media-meta-bar{display:flex;align-items:center;gap:16px;padding:8px 14px;border-top:1px solid var(--theme--border-color-subdued,#f0f0f0);background:var(--theme--background-subdued,#fafafa);font-size:12px;color:var(--theme--foreground-subdued,#999)}
.gcs-meta-item{display:flex;align-items:center;gap:4px}
.gcs-status-badge{margin-left:auto;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
.gcs-status-idle{background:var(--theme--background-normal,#eee);color:var(--theme--foreground-subdued,#999)}
.gcs-status-playing{background:var(--theme--success-background,#e8f5e9);color:var(--theme--success,#2ecda7)}
.gcs-status-paused{background:var(--theme--warning-background,#fff3e0);color:var(--theme--warning,#ffa439)}
.gcs-status-ended{background:var(--theme--background-normal,#eee);color:var(--theme--foreground-subdued,#999)}
.gcs-file-browser{padding:0}
.gcs-file-browser-search{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--theme--border-color-subdued,#f0f0f0);background:var(--theme--background-subdued,#fafafa);position:sticky;top:0;z-index:1}
.gcs-search-icon{color:var(--theme--foreground-subdued,#999);flex-shrink:0}
.gcs-search-input{flex:1;border:none;background:none;outline:none;font-size:14px;color:var(--theme--foreground,#333);font-family:inherit}
.gcs-search-input::placeholder{color:var(--theme--foreground-subdued,#999)}
.gcs-search-clear{color:var(--theme--foreground-subdued,#999);cursor:pointer;flex-shrink:0}
.gcs-search-clear:hover{color:var(--theme--foreground,#333)}
.gcs-file-browser-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:var(--theme--foreground-subdued,#999)}
.gcs-file-browser-loading p{margin:0;font-size:13px}
.gcs-file-browser-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:var(--theme--foreground-subdued,#999)}
.gcs-file-browser-empty p{margin:0;font-size:14px}
.gcs-file-list{padding:8px 0}
.gcs-file-list-item{display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background .15s ease;border-bottom:1px solid var(--theme--border-color-subdued,#f5f5f5)}
.gcs-file-list-item:hover{background:var(--theme--background-subdued,#f7f7f7)}
.gcs-file-list-item.is-selected{background:var(--theme--primary-background,#f0ecff)}
.gcs-file-list-thumb{width:44px;height:44px;border-radius:6px;overflow:hidden;background:var(--theme--background-normal,#eee);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.gcs-file-thumb-img{width:100%;height:100%;object-fit:cover}
.gcs-file-thumb-icon{color:var(--theme--foreground-subdued,#999)}
.gcs-file-list-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.gcs-file-list-name{font-size:13px;font-weight:600;color:var(--theme--foreground,#333);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gcs-file-list-meta{font-size:11px;color:var(--theme--foreground-subdued,#999)}
.gcs-file-list-check{color:var(--theme--primary,#6644ff);flex-shrink:0}
.gcs-file-list-load-more{display:flex;justify-content:center;padding:16px}
`;

if (typeof document !== "undefined") {
    const el = document.getElementById("gcs-media-player-styles") || document.createElement("style");
    el.id = "gcs-media-player-styles";
    el.textContent = _style;
    if (!el.parentNode) document.head.appendChild(el);
}

// Render function
_sfc_main.render = function (_ctx, _cache) {
    const _component_v_icon = resolveComponent("v-icon");
    const _component_v_button = resolveComponent("v-button");
    const _component_v_progress_circular = resolveComponent("v-progress-circular");
    const _component_v_drawer = resolveComponent("v-drawer");
    const _directive_tooltip = resolveDirective("tooltip");

    return (openBlock(), createElementBlock("div", {
        class: "gcs-media-player",
        style: normalizeStyle(_ctx.containerStyle)
    }, [
        // Empty state
        !_ctx.value
            ? (openBlock(), createElementBlock("div", {
                key: 0, class: "gcs-empty-state", onClick: _ctx.openFileDrawer
            }, [
                createElementVNode("div", { class: "gcs-empty-icon" }, [
                    createVNode(_component_v_icon, { name: "play_circle", "x-large": true })
                ]),
                createElementVNode("p", { class: "gcs-empty-text" }, "Haz clic para seleccionar un archivo"),
                createElementVNode("p", { class: "gcs-empty-hint" }, "Formatos: MP4, WebM, OGG, MP3, WAV, AAC")
            ]))
            // Media container
            : (openBlock(), createElementBlock("div", { key: 1, class: "gcs-media-container" }, [
                // Header
                createElementVNode("div", { class: "gcs-media-header" }, [
                    createElementVNode("div", { class: "gcs-file-info" }, [
                        createVNode(_component_v_icon, { name: _ctx.headerIcon, class: "gcs-file-icon" }, null, 8, ["name"]),
                        createElementVNode("div", { class: "gcs-file-details" }, [
                            createElementVNode("span", { class: "gcs-file-name" },
                                toDisplayString((_ctx.fileData && _ctx.fileData.title) || (_ctx.fileData && _ctx.fileData.filename_download) || "Media")
                            ),
                            _ctx.fileData
                                ? (openBlock(), createElementBlock("span", { key: 0, class: "gcs-file-meta" }, [
                                    createTextVNode(toDisplayString(_ctx.formatFileSize(_ctx.fileData.filesize))),
                                    _ctx.fileData.type ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(" \u00B7 " + toDisplayString(_ctx.fileData.type))])) : createCommentVNode("", true)
                                ])) : createCommentVNode("", true)
                        ])
                    ]),
                    !_ctx.disabled
                        ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-media-actions" }, [
                            withDirectives(createVNode(_component_v_button, { "x-small": true, secondary: true, icon: true, onClick: _ctx.openFileDrawer }, { default: withCtx(() => [createVNode(_component_v_icon, { name: "swap_horiz" })]) }), [[_directive_tooltip, "Cambiar archivo"]]),
                            withDirectives(createVNode(_component_v_button, { "x-small": true, secondary: true, icon: true, onClick: _ctx.clearFile }, { default: withCtx(() => [createVNode(_component_v_icon, { name: "close" })]) }), [[_directive_tooltip, "Quitar archivo"]])
                        ])) : createCommentVNode("", true)
                ]),

                // VIDEO PLAYER
                _ctx.isVideoFile
                    ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-video-wrapper", style: normalizeStyle(_ctx.videoWrapperStyle) }, [
                        _ctx.loading
                            ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-media-loading" }, [
                                createVNode(_component_v_progress_circular, { indeterminate: true }),
                                createElementVNode("p", null, "Cargando video...")
                            ]))
                            : _ctx.mediaError
                                ? (openBlock(), createElementBlock("div", { key: 1, class: "gcs-media-error" }, [
                                    createVNode(_component_v_icon, { name: "error_outline", large: true }),
                                    createElementVNode("p", { class: "gcs-error-text" }, toDisplayString(_ctx.mediaError)),
                                    createVNode(_component_v_button, { small: true, secondary: true, onClick: _ctx.retryLoad }, { default: withCtx(() => [createVNode(_component_v_icon, { name: "refresh", left: true }), createTextVNode(" Reintentar")]) })
                                ]))
                                : _ctx.mediaUrl
                                    ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                                        createElementVNode("video", {
                                            ref: "videoElement", class: "gcs-video-element",
                                            controls: _ctx.showControls !== false, autoplay: _ctx.autoplay,
                                            src: _ctx.mediaUrl, preload: "metadata", playsinline: "",
                                            onLoadedmetadata: _ctx.onVideoLoadedMetadata, onCanplay: _ctx.onCanPlay,
                                            onError: _ctx.onMediaError, onPlay: _ctx.onPlay, onPause: _ctx.onPause, onEnded: _ctx.onEnded
                                        }, [createTextVNode("Tu navegador no soporta video.")], 40, ["controls", "autoplay", "src", "onLoadedmetadata", "onCanplay", "onError", "onPlay", "onPause", "onEnded"]),
                                        _ctx.mediaBuffering
                                            ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-media-buffering-overlay" }, [createVNode(_component_v_progress_circular, { indeterminate: true })]))
                                            : createCommentVNode("", true)
                                    ], 64))
                                    : createCommentVNode("", true)
                    ], 4))

                    // AUDIO PLAYER
                    : _ctx.isAudioFile
                        ? (openBlock(), createElementBlock("div", { key: 1, class: "gcs-audio-wrapper" }, [
                            _ctx.loading
                                ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-media-loading gcs-audio-loading" }, [
                                    createVNode(_component_v_progress_circular, { indeterminate: true }),
                                    createElementVNode("p", null, "Cargando audio...")
                                ]))
                                : _ctx.mediaError
                                    ? (openBlock(), createElementBlock("div", { key: 1, class: "gcs-media-error gcs-audio-error-state" }, [
                                        createVNode(_component_v_icon, { name: "error_outline" }),
                                        createElementVNode("p", { class: "gcs-error-text" }, toDisplayString(_ctx.mediaError)),
                                        createVNode(_component_v_button, { small: true, secondary: true, onClick: _ctx.retryLoad }, { default: withCtx(() => [createVNode(_component_v_icon, { name: "refresh", left: true }), createTextVNode(" Reintentar")]) })
                                    ]))
                                    : _ctx.mediaUrl
                                        ? (openBlock(), createElementBlock("div", { key: 2, class: "gcs-audio-player" }, [
                                            createElementVNode("div", { class: "gcs-audio-visual" }, [
                                                createElementVNode("div", {
                                                    class: normalizeClass(["gcs-audio-icon-bg", { "is-playing": _ctx.playbackState === "playing" }])
                                                }, [
                                                    createVNode(_component_v_icon, { name: _ctx.playbackState === "playing" ? "equalizer" : "audiotrack", "x-large": true }, null, 8, ["name"])
                                                ], 2)
                                            ]),
                                            createElementVNode("div", { class: "gcs-audio-controls" }, [
                                                createElementVNode("audio", {
                                                    ref: "audioElement",
                                                    src: _ctx.mediaUrl,
                                                    preload: "metadata",
                                                    controls: true,
                                                    class: "gcs-audio-element",
                                                    onLoadedmetadata: _ctx.onAudioLoadedMetadata,
                                                    onCanplay: _ctx.onCanPlay,
                                                    onError: _ctx.onMediaError,
                                                    onPlay: _ctx.onPlay,
                                                    onPause: _ctx.onPause,
                                                    onEnded: _ctx.onEnded
                                                }, [createTextVNode("Tu navegador no soporta audio.")], 40, ["src", "onLoadedmetadata", "onCanplay", "onError", "onPlay", "onPause", "onEnded"])
                                            ])
                                        ]))
                                        : createCommentVNode("", true)
                        ]))

                        // NOT MEDIA
                        : (_ctx.fileData && !_ctx.isVideoFile && !_ctx.isAudioFile)
                            ? (openBlock(), createElementBlock("div", { key: 2, class: "gcs-not-media" }, [
                                createVNode(_component_v_icon, { name: "block", large: true }),
                                createElementVNode("p", null, "El archivo seleccionado no es un video ni audio"),
                                createElementVNode("p", { class: "gcs-not-media-type" }, "Tipo: " + toDisplayString(_ctx.fileData.type))
                            ]))
                            : createCommentVNode("", true),

                // Meta bar
                _ctx.mediaMeta.duration
                    ? (openBlock(), createElementBlock("div", { key: 3, class: "gcs-media-meta-bar" }, [
                        createElementVNode("span", { class: "gcs-meta-item" }, [
                            createVNode(_component_v_icon, { name: "timer", "x-small": true }),
                            createTextVNode(" " + toDisplayString(_ctx.formatDuration(_ctx.mediaMeta.duration)))
                        ]),
                        (_ctx.mediaMeta.width && _ctx.mediaMeta.height)
                            ? (openBlock(), createElementBlock("span", { key: 0, class: "gcs-meta-item" }, [
                                createVNode(_component_v_icon, { name: "aspect_ratio", "x-small": true }),
                                createTextVNode(" " + toDisplayString(_ctx.mediaMeta.width) + "\u00D7" + toDisplayString(_ctx.mediaMeta.height))
                            ])) : createCommentVNode("", true),
                        createElementVNode("span", { class: "gcs-meta-item gcs-status-badge gcs-status-" + _ctx.playbackState }, toDisplayString(_ctx.playbackStatusLabel))
                    ])) : createCommentVNode("", true)
            ])),

        // File browser drawer
        createVNode(_component_v_drawer, {
            modelValue: _ctx.fileDrawerOpen,
            "onUpdate:modelValue": ($event) => (_ctx.fileDrawerOpen = $event),
            title: "Seleccionar archivo",
            icon: "folder_open",
            onCancel: () => { _ctx.fileDrawerOpen = false; }
        }, {
            default: withCtx(() => [
                createElementVNode("div", { class: "gcs-file-browser" }, [
                    createElementVNode("div", { class: "gcs-file-browser-search" }, [
                        createVNode(_component_v_icon, { name: "search", class: "gcs-search-icon" }),
                        createElementVNode("input", {
                            value: _ctx.searchQuery,
                            onInput: (e) => { _ctx.searchQuery = e.target.value; _ctx.onSearchInput(); },
                            type: "text", placeholder: "Buscar archivos...", class: "gcs-search-input"
                        }, null, 40, ["value", "onInput"]),
                        _ctx.searchQuery
                            ? createVNode(_component_v_icon, { name: "close", class: "gcs-search-clear", clickable: true, onClick: () => { _ctx.searchQuery = ""; _ctx.fetchFileList(); } })
                            : createCommentVNode("", true)
                    ]),
                    _ctx.filesLoading
                        ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-file-browser-loading" }, [
                            createVNode(_component_v_progress_circular, { indeterminate: true }),
                            createElementVNode("p", null, "Cargando archivos...")
                        ]))
                        : _ctx.fileList.length > 0
                            ? (openBlock(), createElementBlock("div", { key: 1, class: "gcs-file-list" }, [
                                (openBlock(true), createElementBlock(Fragment, null, renderList(_ctx.fileList, (file) => {
                                    return (openBlock(), createElementBlock("div", {
                                        key: file.id,
                                        class: normalizeClass(["gcs-file-list-item", { "is-selected": file.id === _ctx.fileId }]),
                                        onClick: () => _ctx.selectFile(file)
                                    }, [
                                        createElementVNode("div", { class: "gcs-file-list-thumb" }, [
                                            (file.type && file.type.startsWith("image/"))
                                                ? createElementVNode("img", { src: "/assets/" + file.id + "?key=system-small-cover", alt: file.title || file.filename_download, class: "gcs-file-thumb-img" })
                                                : createVNode(_component_v_icon, { name: _ctx.getFileIcon(file.type), class: "gcs-file-thumb-icon" })
                                        ]),
                                        createElementVNode("div", { class: "gcs-file-list-info" }, [
                                            createElementVNode("span", { class: "gcs-file-list-name" }, toDisplayString(file.title || file.filename_download)),
                                            createElementVNode("span", { class: "gcs-file-list-meta" }, [
                                                createTextVNode(toDisplayString(_ctx.formatFileSize(file.filesize))),
                                                file.type ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(" \u00B7 " + toDisplayString(file.type))])) : createCommentVNode("", true)
                                            ])
                                        ]),
                                        file.id === _ctx.fileId ? createVNode(_component_v_icon, { name: "check_circle", class: "gcs-file-list-check" }) : createCommentVNode("", true)
                                    ], 10, ["onClick"]));
                                }), 128)),
                                _ctx.hasMore
                                    ? (openBlock(), createElementBlock("div", { key: 0, class: "gcs-file-list-load-more" }, [
                                        createVNode(_component_v_button, { small: true, secondary: true, onClick: _ctx.loadMore }, { default: withCtx(() => [createTextVNode("Cargar m\u00E1s archivos")]) })
                                    ])) : createCommentVNode("", true)
                            ]))
                            : (openBlock(), createElementBlock("div", { key: 2, class: "gcs-file-browser-empty" }, [
                                createVNode(_component_v_icon, { name: "search_off", large: true }),
                                createElementVNode("p", null, "No se encontraron archivos")
                            ]))
                ])
            ]),
            _: 1
        }, 8, ["modelValue", "onUpdate:modelValue", "onCancel"])
    ], 4));
};

var e = defineInterface({
    id: "gcs-video-player",
    name: "GCS Media Player",
    icon: "play_circle",
    description: "Reproduce videos MP4 y audio MP3 almacenados en Google Cloud Storage",
    component: _sfc_main,
    types: ["uuid", "string"],
    localTypes: ["file"],
    group: "relational",
    relational: true,
    options: [
        { field: "autoplay", name: "Autoplay", type: "boolean", meta: { interface: "boolean", width: "half" }, schema: { default_value: false } },
        { field: "showControls", name: "Mostrar Controles", type: "boolean", meta: { interface: "boolean", width: "half" }, schema: { default_value: true } },
        { field: "maxWidth", name: "Ancho M\u00E1ximo", type: "string", meta: { interface: "input", width: "half" }, schema: { default_value: "100%" } },
        { field: "aspectRatio", name: "Relaci\u00F3n de Aspecto", type: "string", meta: { interface: "select-dropdown", width: "half", options: { choices: [{ text: "16:9", value: "16/9" }, { text: "4:3", value: "4/3" }, { text: "1:1", value: "1/1" }, { text: "21:9", value: "21/9" }] } }, schema: { default_value: "16/9" } }
    ]
});

export { e as default };
