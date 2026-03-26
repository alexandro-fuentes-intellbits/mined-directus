<template>
	<private-view title="Explorador de Medios">


		<template #actions>
			<div class="header-actions">
				<v-input
					v-model="search"
					placeholder="Buscar archivos por nombre..."
					@input="onSearchInput"
					class="search-bar-expanded"
					small
					clearable
				>
					<template #prepend>
						<v-icon name="search" />
					</template>
				</v-input>
				<v-button icon secondary @click="fetchFiles(false)" v-tooltip="'Refrescar Galería'">
					<v-icon name="refresh" />
				</v-button>
			</div>
		</template>

		<div class="media-explorer-wrapper">
			<div v-if="loading && files.length === 0" class="loading-state">
				<v-progress-circular indeterminate />
				<p>Cargando medios...</p>
			</div>

			<div v-else-if="files.length === 0" class="empty-state">
				<v-icon name="search_off" x-large />
				<h3>No se encontraron resultados</h3>
				<p>Prueba con otros términos o filtros.</p>
			</div>

			<div v-else class="media-grid">
				<div 
					v-for="(file, index) in files" 
					:key="file.id" 
					class="media-card"
					@click="openDetails(file)"
				>
					<div class="media-preview-box">
						<!-- Image Preview - Improved resolution -->
						<img 
							v-if="isImage(file)" 
							:src="getHighResThumbnail(file.id)" 
							:alt="file.title"
							loading="lazy"
						/>
						
						<!-- Sequential Video Loading -->
						<div v-else-if="isVideo(file)" class="video-preview-container">
							<video 
								v-if="shouldShowVideo(index)"
								class="grid-video-thumb"
								:src="getAssetUrl(file.id) + '#t=0.5'"
								preload="metadata"
								muted
								playsinline
								@loadeddata="onVideoLoaded(index)"
								@error="onVideoError(index)"
							></video>
							<div v-else class="video-skeleton">
								<v-progress-circular small indeterminate />
							</div>
							<div class="video-badge">
								<v-icon name="play_arrow" x-small />
								<span>VIDEO</span>
							</div>
						</div>

						<!-- Audio Preview -->
						<div v-else-if="isAudio(file)" class="audio-grid-preview">
							<div class="audio-icon-circle">
								<v-icon name="music_note" large />
							</div>
						</div>

						<!-- Generic File -->
						<div v-else class="generic-grid-preview">
							<v-icon name="insert_drive_file" large />
							<span class="ext-label">{{ getExtension(file.filename_download) }}</span>
						</div>
					</div>
					
					<div class="media-card-info">
						<span class="media-card-title">{{ file.title || file.filename_download }}</span>
						<div class="media-card-meta">
							<span class="meta-tag">{{ formatSize(file.filesize) }}</span>
							<span class="meta-divider">•</span>
							<span class="meta-type">{{ cleanMime(file.type) }}</span>
						</div>
					</div>
				</div>

				<div v-if="hasMore" class="load-more-container">
					<v-button @click="loadMore" :loading="loading" secondary>
						Ver más archivos
					</v-button>
				</div>
			</div>
		</div>

		<!-- MODAL DE DETALLES MEJORADO - FULL WIDTH Y ESPACIOSO -->
		<v-dialog v-model="detailsOpen" @esc="detailsOpen = false" persistent size="full">
			<v-card v-if="activeFile" class="modern-modal">
				<div class="modal-main-content">
					<div class="modal-visual-viewer">
						<v-button icon secondary @click="detailsOpen = false" class="floating-close-btn" v-tooltip="'Cerrar'">
							<v-icon name="close" />
						</v-button>
						<img 
							v-if="isImage(activeFile)" 
							:src="getLargeImageUrl(activeFile.id)" 
							class="visual-large"
						/>
						<video 
							v-else-if="isVideo(activeFile)" 
							:src="getAssetUrl(activeFile.id)" 
							controls 
							autoplay
							class="visual-large"
						></video>
						<div v-else-if="isAudio(activeFile)" class="visual-audio-central">
							<div class="pulse-icon">
								<v-icon name="graphic_eq" x-large />
							</div>
							<audio :src="getAssetUrl(activeFile.id)" controls class="audio-widget"></audio>
						</div>
						<div v-else class="visual-fallback">
							<v-icon name="description" x-large />
							<p>Vista previa no disponible</p>
						</div>
					</div>

					<div class="modal-sticky-actions">
						<v-button secondary :href="getDownloadUrl(activeFile.id)" download>
							<v-icon name="download" left /> Descargar
						</v-button>
						<v-button primary @click="detailsOpen = false">
							Cerrar
						</v-button>
					</div>

					<div class="details-collapsible">
						<button class="toggle-details-btn" @click="showFullDetails = !showFullDetails">
							<span>{{ showFullDetails ? 'Ocultar Información' : 'Ver Información Técnica' }}</span>
							<v-icon :name="showFullDetails ? 'expand_less' : 'expand_more'" />
						</button>

						<transition name="slide-fade">
							<div v-if="showFullDetails" class="details-grid-expanded">
								<div class="detail-column">
									<div class="detail-item">
										<label>Nombre del archivo</label>
										<p class="long-text">{{ activeFile.filename_download }}</p>
									</div>
									<div class="detail-item">
										<label>Tipo (MIME)</label>
										<p>{{ activeFile.type }}</p>
									</div>
									<div class="detail-item">
										<label>Tamaño</label>
										<p>{{ formatSize(activeFile.filesize) }}</p>
									</div>
								</div>
								<div class="detail-column">
									<div v-if="activeFile.width" class="detail-item">
										<label>Resolución</label>
										<p>{{ activeFile.width }} x {{ activeFile.height }} px</p>
									</div>
									<div class="detail-item">
										<label>Identificador Único</label>
										<p class="uuid-text">{{ activeFile.id }}</p>
									</div>
									<div class="detail-item" v-if="activeFile.duration">
										<label>Duración</label>
										<p>{{ formatDuration(activeFile.duration) }}</p>
									</div>
								</div>
							</div>
						</transition>
					</div>
				</div>
			</v-card>
		</v-dialog>
	</private-view>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useApi } from '@directus/extensions-sdk';

const api = useApi();
const files = ref([]);
const loading = ref(false);
const search = ref('');
const activeFilter = ref('all');
const page = ref(1);
const hasMore = ref(true);
const detailsOpen = ref(false);
const activeFile = ref(null);
const showFullDetails = ref(false);

// Sequential Video Loading Logic
const maxLoadedVideoIndex = ref(0);

const mediaTypes = [
	{ id: 'video', name: 'Videos', icon: 'play_circle' },
];

async function fetchFiles(append = false) {
	if (loading.value) return;
	loading.value = true;
	if (!append) { 
		page.value = 1; 
		files.value = []; 
		maxLoadedVideoIndex.value = 0;
	}

	try {
		const params = {
			fields: ['id', 'title', 'filename_download', 'type', 'filesize', 'width', 'height', 'duration'],
			limit: 24,
			page: page.value,
			sort: ['-uploaded_on'],
		};

		if (search.value) params.search = search.value;
		
		// ALWAYS filter by video extensions and types
		params.filter = {
			_or: [
				{ type: { _starts_with: 'video/' } },
				{ filename_download: { _ends_with: '.mp4' } },
				{ filename_download: { _ends_with: '.MOV' } },
				{ filename_download: { _ends_with: '.mov' } },
				{ filename_download: { _ends_with: '.webm' } },
				{ filename_download: { _ends_with: '.mkv' } },
				{ filename_download: { _ends_with: '.avi' } }
			]
		};

		const response = await api.get('/files', { params });
		const fetched = response.data.data;

		if (append) files.value = [...files.value, ...fetched];
		else files.value = fetched;

		hasMore.value = fetched.length === 24;
	} catch (error) {
		console.error('Error:', error);
	} finally {
		loading.value = false;
	}
}

function loadMore() { page.value++; fetchFiles(true); }

function changeFilter(id) {
	activeFilter.value = id;
	fetchFiles();
}

let timeout;
function onSearchInput() {
	clearTimeout(timeout);
	timeout = setTimeout(() => fetchFiles(), 500);
}

// Sequential Video Handler
function shouldShowVideo(index) {
	// Find the true video index among all files
	let videoCount = 0;
	for (let i = 0; i < files.value.length; i++) {
		if (isVideo(files.value[i])) {
			if (i === index) return videoCount <= maxLoadedVideoIndex.value;
			videoCount++;
		}
	}
	return false;
}

function onVideoLoaded(index) {
	// Only increment if we just loaded the current "head" of the queue
	maxLoadedVideoIndex.value++;
}

function onVideoError(index) {
	// Skip if it fails so the rest can load
	maxLoadedVideoIndex.value++;
}

function openDetails(file) {
	activeFile.value = file;
	showFullDetails.value = false;
	detailsOpen.value = true;
}

// Enhanced Detection Helpers
const getExt = (filename) => {
	if (!filename) return '';
	const parts = filename.split('.');
	return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const isImage = (f) => {
	if (f.type?.startsWith('image/')) return true;
	const ext = getExt(f.filename_download || f.title);
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext);
};

const isVideo = (f) => {
	if (f.type?.startsWith('video/')) return true;
	const ext = getExt(f.filename_download || f.title);
	return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v', 'ts'].includes(ext);
};

const isAudio = (f) => {
	if (f.type?.startsWith('audio/')) return true;
	const ext = getExt(f.filename_download || f.title);
	return ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'].includes(ext);
};

const cleanMime = (mime) => mime?.split('/')[1]?.toUpperCase() || 'FILE';
const getExtension = (n) => n?.split('.').pop()?.toUpperCase() || '';

// High res thumbnail strategy
const getHighResThumbnail = (id) => `/assets/${id}?width=400&height=400&fit=cover&quality=85`;
const getLargeImageUrl = (id) => `/assets/${id}?width=1200&height=1200&fit=contain&quality=90`;
const getAssetUrl = (id) => `/assets/${id}`;
const getDownloadUrl = (id) => `/assets/${id}?download`;

function getIconForType(f) {
	if (isImage(f)) return 'photo';
	if (isVideo(f)) return 'videocam';
	if (isAudio(f)) return 'music_note';
	return 'description';
}

function formatSize(bytes) {
	if (!bytes) return '0 B';
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

function formatDuration(s) {
	if (!s) return '';
	return Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0');
}

onMounted(() => fetchFiles());
</script>

<style scoped>
.header-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1;
	justify-content: flex-end;
}

/* BUSCADOR BALANCEADO */
.search-bar-expanded {
	width: 450px !important;
	max-width: 450px;
}

/* Ajustes para el input interno de Directus */
.search-bar-expanded :deep(.v-input),
.search-bar-expanded :deep(.input-container),
.search-bar-expanded :deep(.input-box),
.search-bar-expanded :deep(input) {
	width: 100% !important;
	max-width: 450px !important;
}

.media-explorer-wrapper {
	padding: 24px;
	height: calc(100vh - 64px);
	overflow-y: auto;
	background-color: var(--v-theme-background-accent, #f0f4f9);
}

.loading-state, .empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 140px 0;
	color: var(--theme--foreground-subdued);
}

.media-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	gap: 24px;
	padding-bottom: 80px;
}

/* CARD DESIGN */
.media-card {
	background: var(--theme--background);
	border-radius: 12px;
	border: 1px solid var(--theme--border-color-subdued);
	overflow: hidden;
	cursor: pointer;
	transition: all 0.25s ease;
	display: flex;
	flex-direction: column;
	box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}

.media-card:hover {
	transform: translateY(-4px);
	box-shadow: 0 12px 20px rgba(0,0,0,0.08);
	border-color: var(--theme--primary);
}

.media-preview-box {
	height: 180px;
	background: #181c20;
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
}

.media-preview-box img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

/* VIDEO THUMB IN GRID */
.video-preview-container {
	width: 100%;
	height: 100%;
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
}
.grid-video-thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.video-skeleton {
	color: white;
	opacity: 0.5;
}
.video-badge {
	position: absolute;
	top: 12px;
	right: 12px;
	background: rgba(0,0,0,0.6);
	color: white;
	padding: 4px 10px;
	border-radius: 20px;
	font-size: 10px;
	font-weight: 800;
	display: flex;
	align-items: center;
	gap: 4px;
	backdrop-filter: blur(8px);
}

/* AUDIO & FILE GRIDS */
.audio-grid-preview, .generic-grid-preview {
	width: 100%;
	height: 100%;
	background: linear-gradient(135deg, var(--theme--primary-subdued) 0%, var(--theme--background-subdued) 100%);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	color: var(--theme--primary);
}
.audio-icon-circle {
	width: 64px;
	height: 64px;
	border-radius: 16px;
	background: white;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}
.ext-label {
	margin-top: 12px;
	font-weight: 900;
	font-size: 12px;
	background: var(--theme--primary);
	color: white;
	padding: 2px 8px;
	border-radius: 4px;
}

.media-card-info {
	padding: 16px;
	background: var(--theme--background);
}
.media-card-title {
	display: block;
	font-weight: 700;
	font-size: 14px;
	color: var(--theme--foreground);
	margin-bottom: 6px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.media-card-meta {
	font-size: 11px;
	color: var(--theme--foreground-subdued);
	display: flex;
	align-items: center;
	gap: 8px;
}
.meta-tag {
	background: var(--theme--background-accent);
	padding: 2px 8px;
	border-radius: 4px;
	font-weight: 600;
}

/* LOAD MORE - Squared */
.load-more-container {
	grid-column: 1 / -1;
	display: flex;
	justify-content: center;
	padding: 40px;
}
.load-more-container :deep(.v-button) {
	border-radius: 4px !important; /* Squared button */
	padding: 10px 30px;
	text-transform: uppercase;
	font-weight: 700;
	letter-spacing: 1px;
}

/* MODAL STYLES */
.modern-modal {
	border-radius: 12px !important;
	overflow-y: auto !important;
	display: flex;
	flex-direction: column;
	max-height: 90vh;
	width: 100%;
	max-width: 1200px;
	margin: 0 auto;
}

.floating-close-btn {
	position: absolute;
	top: 16px;
	right: 16px;
	z-index: 100;
	background: rgba(255, 255, 255, 0.1) !important;
	backdrop-filter: blur(8px);
	border: 1px solid rgba(255, 255, 255, 0.2) !important;
	color: white !important;
}

.floating-close-btn:hover {
	background: rgba(255, 255, 255, 0.2) !important;
}

.modal-visual-viewer {
	background: #000;
	width: 100%;
	min-height: 500px;
	height: 60vh;
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
}
.visual-large {
	width: 100%;
	height: 100%;
	max-width: 100%;
	max-height: 100%;
	object-fit: contain;
}

.modal-sticky-actions {
	display: flex;
	gap: 20px;
	padding: 24px 32px;
	background: var(--theme--background);
	justify-content: flex-end;
	border-top: 1px solid var(--theme--border-color-subdued);
}
.modal-sticky-actions :deep(.v-button) {
	min-width: 160px;
	border-radius: 8px !important;
	height: 44px;
}

/* COLLAPSIBLE DETAILS */
.details-collapsible {
	background: var(--theme--background-accent);
}
.toggle-details-btn {
	width: 100%;
	padding: 24px 32px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	background: none;
	border: none;
	cursor: pointer;
	font-weight: 800;
	font-size: 14px;
	text-transform: uppercase;
	letter-spacing: 1px;
	color: var(--theme--foreground);
	border-top: 1px solid var(--theme--border-color-subdued);
}
.toggle-details-btn:hover { background: rgba(0,0,0,0.03); }

.details-grid-expanded {
	padding: 0 32px 48px;
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 40px;
}

.detail-column {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.detail-item label {
	display: block;
	font-size: 11px;
	text-transform: uppercase;
	font-weight: 800;
	color: var(--theme--foreground-subdued);
	margin-bottom: 8px;
	letter-spacing: 0.5px;
}
.detail-item p {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--theme--foreground);
	line-height: 1.4;
}
.long-text {
	word-break: break-all;
	white-space: normal;
}
.uuid-text {
	font-family: 'Roboto Mono', monospace;
	font-size: 14px !important;
	color: var(--theme--primary) !important;
	background: var(--theme--primary-subdued);
	padding: 4px 8px;
	border-radius: 4px;
	display: inline-block;
}

/* TRANSITIONS */
.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { opacity: 0; transform: translateY(-20px); }
</style>
