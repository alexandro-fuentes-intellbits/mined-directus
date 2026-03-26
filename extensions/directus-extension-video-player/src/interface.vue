<template>
	<div class="gcs-media-player" :style="containerStyle">
		<!-- Estado: Sin archivo seleccionado -->
		<div v-if="!value" class="empty-state" @click="openFileDrawer">
			<div class="empty-icon">
				<v-icon name="play_circle" x-large />
			</div>
			<p class="empty-text">Haz clic para seleccionar un archivo</p>
			<p class="empty-hint">Formatos: MP4, WebM, OGG, MP3, WAV, AAC</p>
		</div>

		<!-- Estado: Archivo seleccionado -->
		<div v-else class="media-container">
			<!-- Header con info del archivo -->
			<div class="media-header">
				<div class="file-info">
					<v-icon :name="headerIcon" class="file-icon" />
					<div class="file-details">
						<span class="file-name">{{ fileData?.title || fileData?.filename_download || 'Media' }}</span>
						<span class="file-meta" v-if="fileData">
							{{ formatFileSize(fileData.filesize) }}
							<template v-if="fileData.type"> · {{ fileData.type }}</template>
						</span>
					</div>
				</div>
				<div class="media-actions" v-if="!disabled">
					<v-button x-small secondary icon @click="openFileDrawer" v-tooltip="'Cambiar archivo'">
						<v-icon name="swap_horiz" />
					</v-button>
					<v-button x-small secondary icon @click="clearFile" v-tooltip="'Quitar archivo'">
						<v-icon name="close" />
					</v-button>
				</div>
			</div>

			<!-- Reproductor de VIDEO -->
			<div v-if="isVideoFile" class="video-wrapper" :style="videoWrapperStyle">
				<div v-if="loading" class="media-loading">
					<v-progress-circular indeterminate />
					<p>Cargando video...</p>
				</div>

				<div v-else-if="mediaError" class="media-error">
					<v-icon name="error_outline" large />
					<p class="error-text">{{ mediaError }}</p>
					<v-button small secondary @click="retryLoad">
						<v-icon name="refresh" left />
						Reintentar
					</v-button>
				</div>

				<template v-else-if="mediaUrl">
					<video
						ref="videoElement"
						class="video-element"
						:controls="showControls !== false"
						:autoplay="autoplay"
						:src="mediaUrl"
						preload="metadata"
						playsinline
						@loadedmetadata="onVideoLoadedMetadata"
						@canplay="onCanPlay"
						@error="onMediaError"
						@play="onPlay"
						@pause="onPause"
						@ended="onEnded"
					>
						Tu navegador no soporta la reproducción de video.
					</video>

					<div v-if="mediaBuffering" class="media-buffering-overlay">
						<v-progress-circular indeterminate />
					</div>
				</template>
			</div>

			<!-- Reproductor de AUDIO -->
			<div v-else-if="isAudioFile" class="audio-wrapper">
				<div v-if="loading" class="media-loading audio-loading">
					<v-progress-circular indeterminate />
					<p>Cargando audio...</p>
				</div>

				<div v-else-if="mediaError" class="media-error audio-error-state">
					<v-icon name="error_outline" />
					<p class="error-text">{{ mediaError }}</p>
					<v-button small secondary @click="retryLoad">
						<v-icon name="refresh" left />
						Reintentar
					</v-button>
				</div>

				<template v-else-if="mediaUrl">
					<div class="audio-player">
						<div class="audio-visual">
							<div class="audio-icon-bg" :class="{ 'is-playing': playbackState === 'playing' }">
								<v-icon :name="playbackState === 'playing' ? 'equalizer' : 'audiotrack'" x-large />
							</div>
						</div>

						<div class="audio-controls">
							<audio
								ref="audioElement"
								:src="mediaUrl"
								preload="metadata"
								controls
								class="audio-element"
								@loadedmetadata="onAudioLoadedMetadata"
								@canplay="onCanPlay"
								@error="onMediaError"
								@play="onPlay"
								@pause="onPause"
								@ended="onEnded"
							>
								Tu navegador no soporta la reproducción de audio.
							</audio>
						</div>
					</div>
				</template>
			</div>

			<!-- No es ni video ni audio -->
			<div v-else-if="fileData && !isVideoFile && !isAudioFile" class="not-media">
				<v-icon name="block" large />
				<p>El archivo seleccionado no es un video ni audio</p>
				<p class="not-media-type">Tipo: {{ fileData.type }}</p>
			</div>

			<!-- Metadata bar -->
			<div v-if="mediaMeta.duration" class="media-meta-bar">
				<span class="meta-item">
					<v-icon name="timer" x-small />
					{{ formatDuration(mediaMeta.duration) }}
				</span>
				<span v-if="mediaMeta.width && mediaMeta.height" class="meta-item">
					<v-icon name="aspect_ratio" x-small />
					{{ mediaMeta.width }}×{{ mediaMeta.height }}
				</span>
				<span class="meta-item status-badge" :class="playbackStatus">
					{{ playbackStatusLabel }}
				</span>
			</div>
		</div>

		<!-- Drawer para selección de archivo -->
		<v-drawer
			v-model="fileDrawerOpen"
			title="Seleccionar archivo"
			icon="folder_open"
			@cancel="fileDrawerOpen = false"
		>
			<template #default>
				<div class="file-browser">
					<div class="file-browser-search">
						<v-icon name="search" class="search-icon" />
						<input
							v-model="searchQuery"
							type="text"
							placeholder="Buscar archivos..."
							class="search-input"
							@input="onSearchInput"
						/>
						<v-icon
							v-if="searchQuery"
							name="close"
							class="search-clear"
							clickable
							@click="searchQuery = ''; fetchFileList()"
						/>
					</div>

					<div v-if="filesLoading" class="file-browser-loading">
						<v-progress-circular indeterminate />
						<p>Cargando archivos...</p>
					</div>

					<div v-else-if="fileList.length > 0" class="file-list">
						<div
							v-for="file in fileList"
							:key="file.id"
							class="file-list-item"
							:class="{ 'is-selected': file.id === fileId }"
							@click="selectFile(file)"
						>
							<div class="file-list-thumb">
								<img
									v-if="file.type && file.type.startsWith('image/')"
									:src="'/assets/' + file.id + '?key=system-small-cover'"
									:alt="file.title || file.filename_download"
									class="file-thumb-img"
								/>
								<v-icon
									v-else
									:name="getFileIcon(file.type)"
									class="file-thumb-icon"
								/>
							</div>

							<div class="file-list-info">
								<span class="file-list-name">{{ file.title || file.filename_download }}</span>
								<span class="file-list-meta">
									{{ formatFileSize(file.filesize) }}
									<template v-if="file.type"> · {{ file.type }}</template>
								</span>
							</div>

							<v-icon
								v-if="file.id === fileId"
								name="check_circle"
								class="file-list-check"
							/>
						</div>

						<div v-if="hasMore" class="file-list-load-more">
							<v-button small secondary @click="loadMore">
								Cargar más archivos
							</v-button>
						</div>
					</div>

					<div v-else class="file-browser-empty">
						<v-icon name="search_off" large />
						<p>No se encontraron archivos</p>
					</div>
				</div>
			</template>
		</v-drawer>
	</div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useApi } from '@directus/extensions-sdk';

const props = defineProps({
	value: { type: [String, Object], default: null },
	disabled: { type: Boolean, default: false },
	collection: { type: String, default: null },
	field: { type: String, default: null },
	primaryKey: { type: [String, Number], default: null },
	autoplay: { type: Boolean, default: false },
	showControls: { type: Boolean, default: true },
	maxWidth: { type: String, default: '100%' },
	aspectRatio: { type: String, default: '16/9' },
});

const emit = defineEmits(['input']);
const api = useApi();

// Reactive state
const fileData = ref(null);
const loading = ref(false);
const mediaError = ref(null);
const fileDrawerOpen = ref(false);
const videoElement = ref(null);
const audioElement = ref(null);
const playbackState = ref('idle');
const mediaBuffering = ref(true);

const mediaMeta = ref({ duration: 0, width: 0, height: 0 });

// File browser state
const fileList = ref([]);
const filesLoading = ref(false);
const searchQuery = ref('');
const filePage = ref(1);
const hasMore = ref(false);
const fileLimit = 25;
let searchTimeout = null;

// Extension lists
const videoExtensions = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v'];
const audioExtensions = ['.mp3', '.wav', '.aac', '.flac', '.m4a', '.wma', '.opus'];

// Computed
const fileId = computed(() => {
	if (!props.value) return null;
	if (typeof props.value === 'string') return props.value;
	if (typeof props.value === 'object' && props.value.id) return props.value.id;
	return null;
});

const isVideoFile = computed(() => {
	if (!fileData.value) return false;
	const type = fileData.value.type || '';
	if (type.startsWith('video/')) return true;
	const filename = (fileData.value.filename_download || '').toLowerCase();
	return videoExtensions.some(ext => filename.endsWith(ext));
});

const isAudioFile = computed(() => {
	if (!fileData.value) return false;
	const type = fileData.value.type || '';
	if (type.startsWith('audio/')) return true;
	const filename = (fileData.value.filename_download || '').toLowerCase();
	return audioExtensions.some(ext => filename.endsWith(ext));
});

const isMediaFile = computed(() => isVideoFile.value || isAudioFile.value);

const mediaUrl = computed(() => {
	if (!fileId.value) return null;
	if (!isMediaFile.value) return null;
	return `/assets/${fileId.value}`;
});

const headerIcon = computed(() => {
	if (isAudioFile.value) return 'audiotrack';
	return 'smart_display';
});

const containerStyle = computed(() => ({
	'--max-width': props.maxWidth || '100%',
}));

const videoWrapperStyle = computed(() => ({
	aspectRatio: props.aspectRatio || '16/9',
}));

const playbackStatus = computed(() => playbackState.value);

const playbackStatusLabel = computed(() => {
	const labels = {
		idle: 'Listo',
		playing: '▶ Reproduciendo',
		paused: '⏸ Pausado',
		ended: '⏹ Finalizado',
	};
	return labels[playbackState.value] || 'Listo';
});

// Methods
function openFileDrawer() {
	if (props.disabled) return;
	fileDrawerOpen.value = true;
	filePage.value = 1;
	searchQuery.value = '';
	fetchFileList();
}

function selectFile(file) {
	emit('input', file.id);
	fileDrawerOpen.value = false;
}

async function fetchFileList() {
	filesLoading.value = true;
	try {
		const params = {
			fields: ['id', 'title', 'filename_download', 'type', 'filesize'],
			limit: fileLimit,
			page: filePage.value,
			sort: ['-uploaded_on'],
		};
		if (searchQuery.value) {
			params.search = searchQuery.value;
		}
		const response = await api.get('/files', { params });
		const files = response.data.data || [];
		if (filePage.value === 1) {
			fileList.value = files;
		} else {
			fileList.value = [...fileList.value, ...files];
		}
		hasMore.value = files.length === fileLimit;
	} catch (err) {
		console.error('Error fetching file list:', err);
		fileList.value = [];
	} finally {
		filesLoading.value = false;
	}
}

function loadMore() {
	filePage.value++;
	fetchFileList();
}

function onSearchInput() {
	if (searchTimeout) clearTimeout(searchTimeout);
	searchTimeout = setTimeout(() => {
		filePage.value = 1;
		fetchFileList();
	}, 300);
}

function getFileIcon(type) {
	if (!type) return 'insert_drive_file';
	if (type.startsWith('video/')) return 'smart_display';
	if (type.startsWith('image/')) return 'image';
	if (type.startsWith('audio/')) return 'audiotrack';
	if (type.includes('pdf')) return 'picture_as_pdf';
	return 'insert_drive_file';
}

function clearFile() {
	emit('input', null);
	fileData.value = null;
	mediaError.value = null;
	playbackState.value = 'idle';
	mediaMeta.value = { duration: 0, width: 0, height: 0 };
}

async function fetchFileData() {
	if (!fileId.value) {
		fileData.value = null;
		return;
	}
	loading.value = true;
	mediaError.value = null;
	mediaBuffering.value = true;
	try {
		const response = await api.get(`/files/${fileId.value}`, {
			params: {
				fields: ['id', 'title', 'filename_download', 'type', 'filesize', 'width', 'height', 'duration', 'storage'],
			},
		});
		fileData.value = response.data.data;
	} catch (err) {
		console.error('Error fetching file data:', err);
		mediaError.value = 'No se pudo cargar la información del archivo';
		fileData.value = null;
	} finally {
		loading.value = false;
	}
}

function formatFileSize(bytes) {
	if (!bytes) return '';
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = parseInt(bytes);
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
	if (!seconds) return '';
	const totalSeconds = Math.floor(seconds);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (h > 0) {
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${m}:${String(s).padStart(2, '0')}`;
}

function retryLoad() {
	mediaError.value = null;
	fetchFileData();
}

// Media event handlers
function onCanPlay() {
	mediaBuffering.value = false;
}

function onVideoLoadedMetadata() {
	mediaBuffering.value = false;
	if (videoElement.value) {
		mediaMeta.value = {
			duration: videoElement.value.duration,
			width: videoElement.value.videoWidth,
			height: videoElement.value.videoHeight,
		};
	}
}

function onAudioLoadedMetadata() {
	mediaBuffering.value = false;
	if (audioElement.value) {
		mediaMeta.value = {
			duration: audioElement.value.duration,
			width: 0,
			height: 0,
		};
	}
}

function onMediaError(event) {
	mediaBuffering.value = false;
	const el = event.target;
	const error = el?.error;
	const errorMessages = {
		1: 'La carga fue abortada',
		2: 'Error de red al cargar el archivo',
		3: 'Error al decodificar el archivo',
		4: 'Formato no soportado',
	};
	mediaError.value = error
		? errorMessages[error.code] || `Error al cargar (código: ${error.code})`
		: 'Error desconocido al cargar el archivo';
}

function onPlay() { playbackState.value = 'playing'; }
function onPause() { playbackState.value = 'paused'; }
function onEnded() { playbackState.value = 'ended'; }

// Watchers
watch(
	() => fileId.value,
	(newId) => {
		if (newId) {
			fetchFileData();
		} else {
			fileData.value = null;
		}
	},
	{ immediate: true }
);

// Lifecycle
onBeforeUnmount(() => {
	if (videoElement.value) {
		videoElement.value.pause();
		videoElement.value.src = '';
		videoElement.value.load();
	}
	if (audioElement.value) {
		audioElement.value.pause();
		audioElement.value.src = '';
		audioElement.value.load();
	}
	if (searchTimeout) clearTimeout(searchTimeout);
});
</script>

<style scoped>
.gcs-media-player {
	width: 100%;
	max-width: var(--max-width, 100%);
	font-family: var(--theme--fonts--sans--font-family, 'Inter', system-ui, sans-serif);
}

/* Empty state */
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 40px 20px;
	border: 2px dashed var(--theme--border-color, #e0e0e0);
	border-radius: var(--theme--border-radius, 12px);
	cursor: pointer;
	transition: all 0.2s ease;
	background: var(--theme--background-subdued, #f7f7f7);
}
.empty-state:hover {
	border-color: var(--theme--primary, #6644ff);
	background: var(--theme--primary-background, #f0ecff);
}
.empty-icon {
	margin-bottom: 12px;
	color: var(--theme--foreground-subdued, #999);
	transition: color 0.2s ease;
}
.empty-state:hover .empty-icon {
	color: var(--theme--primary, #6644ff);
}
.empty-text {
	font-size: 14px;
	font-weight: 600;
	color: var(--theme--foreground, #333);
	margin: 0 0 4px;
}
.empty-hint {
	font-size: 12px;
	color: var(--theme--foreground-subdued, #999);
	margin: 0;
}

/* Media container */
.media-container {
	border: 1px solid var(--theme--border-color, #e0e0e0);
	border-radius: var(--theme--border-radius, 12px);
	overflow: hidden;
	background: var(--theme--background, #fff);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* Header */
.media-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	border-bottom: 1px solid var(--theme--border-color-subdued, #f0f0f0);
	background: var(--theme--background-subdued, #fafafa);
}
.file-info {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	flex: 1;
}
.file-icon { color: var(--theme--primary, #6644ff); flex-shrink: 0; }
.file-details { display: flex; flex-direction: column; min-width: 0; }
.file-name {
	font-size: 13px;
	font-weight: 600;
	color: var(--theme--foreground, #333);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.file-meta { font-size: 11px; color: var(--theme--foreground-subdued, #999); }
.media-actions { display: flex; gap: 4px; flex-shrink: 0; }

/* Video wrapper */
.video-wrapper {
	position: relative;
	width: 100%;
	background: #000;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 200px;
	overflow: hidden;
}
.video-element { width: 100%; height: 100%; object-fit: contain; display: block; }

/* Audio wrapper */
.audio-wrapper {
	padding: 0;
	background: var(--theme--background, #fff);
}
.audio-player {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0;
}
.audio-visual {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 28px 20px 20px;
	width: 100%;
	background: linear-gradient(135deg,
		var(--theme--primary-background, #f0ecff) 0%,
		var(--theme--background-subdued, #fafafa) 100%
	);
}
.audio-icon-bg {
	width: 72px;
	height: 72px;
	border-radius: 50%;
	background: var(--theme--primary, #6644ff);
	display: flex;
	align-items: center;
	justify-content: center;
	color: #fff;
	transition: all 0.3s ease;
	box-shadow: 0 4px 16px rgba(102, 68, 255, 0.25);
}
.audio-icon-bg.is-playing {
	animation: pulse-audio 2s ease-in-out infinite;
	box-shadow: 0 4px 24px rgba(102, 68, 255, 0.4);
}
@keyframes pulse-audio {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(1.06); }
}
.audio-controls {
	width: 100%;
	padding: 12px 16px 16px;
}
.audio-element {
	width: 100%;
	height: 40px;
	border-radius: 8px;
	outline: none;
}

/* Loading states */
.media-loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	color: rgba(255, 255, 255, 0.8);
	padding: 40px;
}
.media-loading p { margin: 0; font-size: 13px; }
.audio-loading {
	color: var(--theme--foreground-subdued, #999);
	padding: 30px;
}

/* Error states */
.media-error {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 40px;
	color: var(--theme--danger, #e35169);
}
.error-text { margin: 0; font-size: 13px; text-align: center; color: rgba(255, 255, 255, 0.9); }
.audio-error-state { padding: 30px; }
.audio-error-state .error-text { color: var(--theme--danger, #e35169); }

/* Not a media file */
.not-media {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 40px;
	color: var(--theme--foreground-subdued, #999);
}
.not-media p { margin: 0; font-size: 13px; }
.not-media-type { font-size: 11px; opacity: 0.6; }

/* Buffering overlay */
.media-buffering-overlay {
	position: absolute;
	top: 0; left: 0; right: 0; bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.5);
	z-index: 2;
}

/* Meta bar */
.media-meta-bar {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 8px 14px;
	border-top: 1px solid var(--theme--border-color-subdued, #f0f0f0);
	background: var(--theme--background-subdued, #fafafa);
	font-size: 12px;
	color: var(--theme--foreground-subdued, #999);
}
.meta-item { display: flex; align-items: center; gap: 4px; }
.status-badge {
	margin-left: auto;
	padding: 2px 8px;
	border-radius: 10px;
	font-size: 11px;
	font-weight: 500;
}
.status-badge.idle { background: var(--theme--background-normal, #eee); color: var(--theme--foreground-subdued, #999); }
.status-badge.playing { background: var(--theme--success-background, #e8f5e9); color: var(--theme--success, #2ecda7); }
.status-badge.paused { background: var(--theme--warning-background, #fff3e0); color: var(--theme--warning, #ffa439); }
.status-badge.ended { background: var(--theme--background-normal, #eee); color: var(--theme--foreground-subdued, #999); }

/* File Browser */
.file-browser { padding: 0; }
.file-browser-search {
	display: flex; align-items: center; gap: 8px;
	padding: 12px 16px;
	border-bottom: 1px solid var(--theme--border-color-subdued, #f0f0f0);
	background: var(--theme--background-subdued, #fafafa);
	position: sticky; top: 0; z-index: 1;
}
.search-icon { color: var(--theme--foreground-subdued, #999); flex-shrink: 0; }
.search-input {
	flex: 1; border: none; background: none; outline: none;
	font-size: 14px; color: var(--theme--foreground, #333); font-family: inherit;
}
.search-input::placeholder { color: var(--theme--foreground-subdued, #999); }
.search-clear { color: var(--theme--foreground-subdued, #999); cursor: pointer; flex-shrink: 0; }
.search-clear:hover { color: var(--theme--foreground, #333); }
.file-browser-loading {
	display: flex; flex-direction: column; align-items: center;
	justify-content: center; gap: 12px; padding: 60px 20px;
	color: var(--theme--foreground-subdued, #999);
}
.file-browser-loading p { margin: 0; font-size: 13px; }
.file-browser-empty {
	display: flex; flex-direction: column; align-items: center;
	justify-content: center; gap: 12px; padding: 60px 20px;
	color: var(--theme--foreground-subdued, #999);
}
.file-browser-empty p { margin: 0; font-size: 14px; }
.file-list { padding: 8px 0; }
.file-list-item {
	display: flex; align-items: center; gap: 12px;
	padding: 10px 16px; cursor: pointer;
	transition: background 0.15s ease;
	border-bottom: 1px solid var(--theme--border-color-subdued, #f5f5f5);
}
.file-list-item:hover { background: var(--theme--background-subdued, #f7f7f7); }
.file-list-item.is-selected { background: var(--theme--primary-background, #f0ecff); }
.file-list-thumb {
	width: 44px; height: 44px; border-radius: 6px; overflow: hidden;
	background: var(--theme--background-normal, #eee);
	display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.file-thumb-img { width: 100%; height: 100%; object-fit: cover; }
.file-thumb-icon { color: var(--theme--foreground-subdued, #999); }
.file-list-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.file-list-name {
	font-size: 13px; font-weight: 600; color: var(--theme--foreground, #333);
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.file-list-meta { font-size: 11px; color: var(--theme--foreground-subdued, #999); }
.file-list-check { color: var(--theme--primary, #6644ff); flex-shrink: 0; }
.file-list-load-more { display: flex; justify-content: center; padding: 16px; }
</style>
