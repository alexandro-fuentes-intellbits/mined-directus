<template>
	<private-view title="Horarios de Clases">
		<template #actions>
			<div class="header-actions">
				<v-input
					v-model="localSearch"
					placeholder="Buscar por clase, materia o profesor..."
					class="search-bar"
					small
					clearable
				>
					<template #prepend>
						<v-icon name="search" />
					</template>
				</v-input>
				<v-button icon secondary @click="forceRefresh" v-tooltip="'Refrescar'">
					<v-icon name="refresh" />
				</v-button>
			</div>
		</template>

		<div class="cs-wrapper">
			<!-- Filtros -->
			<div class="cs-filters" v-if="allItems.length > 0">
				<select v-model="filterEscuela" class="cs-select">
					<option value="">Todas las Escuelas</option>
					<option v-for="opt in uniqueEscuelas" :key="opt" :value="opt">{{ opt }}</option>
				</select>
				<select v-model="filterClase" class="cs-select">
					<option value="">Todas las Clases</option>
					<option v-for="opt in uniqueClases" :key="opt" :value="opt">{{ opt }}</option>
				</select>
				<select v-model="filterMateria" class="cs-select">
					<option value="">Todas las Materias</option>
					<option v-for="opt in uniqueMaterias" :key="opt" :value="opt">{{ opt }}</option>
				</select>
				<select v-model="filterProfesor" class="cs-select">
					<option value="">Todos los Profesores</option>
					<option v-for="opt in uniqueProfesores" :key="opt" :value="opt">{{ opt }}</option>
				</select>
				<button v-if="hasActiveFilters" class="cs-clear-btn" @click="clearFilters">✕ Limpiar</button>
			</div>

			<!-- Loading (solo primera carga) -->
			<div v-if="loading && allItems.length === 0" class="cs-loading">
				<v-progress-circular indeterminate />
				<p>Cargando horarios...</p>
			</div>

			<!-- Grid de tarjetas -->
			<div v-else-if="filteredItems.length > 0" class="cs-grid">
				<div
					v-for="item in filteredItems"
					:key="item.id"
					class="cs-card"
					@click="navigate(item)"
				>
					<!-- Cabecera -->
					<div class="cs-card-header">
						<h3 class="cs-card-title">{{ getTitle(item) }}</h3>
					</div>

					<!-- Fechas -->
					<div class="cs-card-dates">
						<div class="cs-date-col" v-for="d in getDates(item)" :key="d.label">
							<span class="cs-date-label">{{ d.label }}</span>
							<span class="cs-date-value">{{ d.value }}</span>
						</div>
					</div>

					<hr class="cs-divider" />

					<!-- Info: Clase, Materia, Profesor -->
					<div class="cs-info-lines">
						<div class="cs-info-line">
							<span class="cs-info-icon">📌</span>
							<strong>Clase:</strong>
							<span>{{ displayValue(getInfoField(item, ['classroom_id','class_id','clase','name','title','nombre'])) }}</span>
						</div>
						<div class="cs-info-line">
							<span class="cs-info-icon">📚</span>
							<strong>Materia:</strong>
							<span>{{ displayValue(getInfoField(item, ['subject_id','materia_id','materia','curso','course','subject','modulo'])) }}</span>
						</div>
						<div class="cs-info-line">
							<span class="cs-info-icon">👩‍🏫</span>
							<strong>Profesor:</strong>
							<span>{{ displayValue(getInfoField(item, ['teacher_id','profesor_id','profesor','teacher','docente','instructor'])) }}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Sin resultados -->
			<div v-else-if="allItems.length > 0" class="cs-empty">
				<v-icon name="search_off" x-large />
				<p>No se encontraron resultados.</p>
				<v-button secondary @click="clearFilters">Limpiar filtros</v-button>
			</div>

			<div v-else-if="!loading" class="cs-empty">
				<v-icon name="event_busy" x-large />
				<p>No hay horarios en esta colección.</p>
			</div>
		</div>
	</private-view>
</template>

<script>
// TRUE module-level cache — persists across navigation
const _cache = {
	items: [],
	loaded: false,
};
</script>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { useRouter } from 'vue-router';

const api = useApi();
const router = useRouter();

const allItems = ref(_cache.loaded ? [..._cache.items] : []);
const loading = ref(false);
const localSearch = ref('');
const filterEscuela = ref('');
const filterClase = ref('');
const filterMateria = ref('');
const filterProfesor = ref('');

const COLLECTION = 'class_schedules_files';

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchItems() {
	if (loading.value) return;
	loading.value = true;
	try {
		const res = await api.get(`/items/${COLLECTION}`, {
			params: {
				fields: ['*', '*.*', '*.*.*'],
				limit: 500,
				sort: '-date_created',
			},
		});
		const fetched = res.data?.data || [];
		allItems.value = fetched;
		_cache.items = [...fetched];
		_cache.loaded = true;
	} catch (e) {
		console.error('[class-schedules module]', e);
	} finally {
		loading.value = false;
	}
}

function forceRefresh() {
	_cache.loaded = false;
	fetchItems();
}

onMounted(() => {
	if (_cache.loaded && _cache.items.length > 0) {
		allItems.value = [..._cache.items];
		// Silent background refresh
		fetchItems();
	} else {
		fetchItems();
	}
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (s) =>
	(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const getInfoField = (item, keys) => {
	try {
		for (const key of keys) {
			const v = item[key];
			if (v !== undefined && v !== null && v !== '') {
				if (typeof v === 'object' && !Array.isArray(v))
					return v.nickname || v.name || v.nombre || v.first_name || v.title || v.clase || '--';
				return String(v);
			}
		}
		// Also check class_schedule_id nested
		const nested = item.class_schedule_id;
		if (nested && typeof nested === 'object') {
			for (const key of keys) {
				const v = nested[key];
				if (v !== undefined && v !== null && v !== '') {
					if (typeof v === 'object' && !Array.isArray(v))
						return v.nickname || v.name || v.nombre || v.first_name || v.title || v.clase || '--';
					return String(v);
				}
			}
		}
	} catch (_) {}
	return '--';
};

const displayValue = (val) => {
	if (val === undefined || val === null || val === '' || val === '--') return 'N/A';
	return val;
};

const getSchool = (item) => {
	try {
		const cl = item.classroom_id;
		if (!cl || typeof cl !== 'object') return '--';
		const s = cl.school_id;
		if (!s) return '--';
		return (typeof s === 'object') ? (s.name || s.nombre || s.title || '--') : '--';
	} catch { return '--'; }
};

const findTitle = (obj, depth = 0) => {
	if (depth > 3 || !obj || typeof obj !== 'object') return null;
	if (obj.clase && typeof obj.clase === 'string') return obj.clase;
	if (obj.name && typeof obj.name === 'string') return obj.name;
	if (obj.title && typeof obj.title === 'string') return obj.title;
	if (obj.nombre && typeof obj.nombre === 'string') return obj.nombre;
	const str = Object.values(obj).find(
		v => typeof v === 'string' && v.length > 10 && !v.includes('-')
	);
	if (str && !/^[0-9a-f]{8}-/.test(str)) return str;
	for (const key in obj)
		if (typeof obj[key] === 'object') { const r = findTitle(obj[key], depth + 1); if (r) return r; }
	return null;
};

const getTitle = (item) => {
	if (item.class_schedule_id && typeof item.class_schedule_id === 'object') {
		const t = findTitle(item.class_schedule_id);
		if (t) return t;
	}
	return findTitle(item) || 'Clase Sin Título';
};

const toDate = (val) => {
	if (!val) return null;
	if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
	if (typeof val === 'number') {
		const d = new Date(val);
		return isNaN(d.getTime()) ? null : d;
	}
	if (typeof val === 'string') {
		const s = val.trim();
		// Accept "YYYY-MM-DD HH:mm:ss(.sss)" by converting to ISO-ish.
		const pg =
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/;
		const candidate = pg.test(s) ? s.replace(' ', 'T') : s;
		const d = new Date(candidate);
		return isNaN(d.getTime()) ? null : d;
	}
	// Some Directus relational fields can be objects; ignore those here.
	return null;
};

const formatDate = (val) => {
	const d = toDate(val);
	if (!d) return '--';
	return d.toLocaleString('es-ES', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const getDates = (item) => {
	// En esta colección los campos son directos en el registro:
	// start_date y end_date (no anidados).
	const startRaw = item.start_date;
	const endRaw = item.end_date;

	return [
		{ label: 'Creación', value: formatDate(item.date_created) },
		{ label: 'Inicio', value: formatDate(startRaw) },
		{ label: 'Fin', value: formatDate(endRaw) },
	];
};

const navigate = (item) => {
	router.push(`/content/${COLLECTION}/${item.id}`);
};

// ─── Computed filters ─────────────────────────────────────────────────────────
const hasActiveFilters = computed(() =>
	filterEscuela.value || filterClase.value || filterMateria.value || filterProfesor.value || localSearch.value
);

const clearFilters = () => {
	filterEscuela.value = '';
	filterClase.value = '';
	filterMateria.value = '';
	filterProfesor.value = '';
	localSearch.value = '';
};

const uniqueEscuelas = computed(() => {
	const s = new Set(allItems.value.map(i => getSchool(i)));
	return [...s].filter(v => v !== '--').sort();
});
const uniqueClases = computed(() => {
	const s = new Set(allItems.value.map(i => getInfoField(i, ['classroom_id','class_id','clase','name','title','nombre'])));
	return [...s].filter(v => v !== '--').sort();
});
const uniqueMaterias = computed(() => {
	const s = new Set(allItems.value.map(i => getInfoField(i, ['subject_id','materia_id','materia','curso','course','subject','modulo'])));
	return [...s].filter(v => v !== '--').sort();
});
const uniqueProfesores = computed(() => {
	const s = new Set(allItems.value.map(i => getInfoField(i, ['teacher_id','profesor_id','profesor','teacher','docente','instructor'])));
	return [...s].filter(v => v !== '--').sort();
});

const filteredItems = computed(() => {
	return allItems.value.filter(item => {
		const escuela  = getSchool(item);
		const clase    = getInfoField(item, ['classroom_id','class_id','clase','name','title','nombre']);
		const materia  = getInfoField(item, ['subject_id','materia_id','materia','curso','course','subject','modulo']);
		const profesor = getInfoField(item, ['teacher_id','profesor_id','profesor','teacher','docente','instructor']);

		// Solo mostrar cards que tengan clase válida.
		if (!clase || clase === '--') return false;

		if (filterEscuela.value  && filterEscuela.value  !== escuela)  return false;
		if (filterClase.value    && filterClase.value    !== clase)    return false;
		if (filterMateria.value  && filterMateria.value  !== materia)  return false;
		if (filterProfesor.value && filterProfesor.value !== profesor) return false;

		if (localSearch.value.trim()) {
			const q = normalize(localSearch.value);
			if (
				!normalize(getTitle(item)).includes(q) &&
				!normalize(clase).includes(q) &&
				!normalize(materia).includes(q) &&
				!normalize(profesor).includes(q)
			) return false;
		}
		return true;
	});
});
</script>

<style scoped>
.header-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1;
	justify-content: flex-end;
}
.search-bar { width: 400px !important; }

/* Wrapper */
.cs-wrapper {
	padding: 24px;
	min-height: 100%;
	background: var(--theme--background, #f4f6f8);
}

/* Filters */
.cs-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-bottom: 24px;
	align-items: center;
}
.cs-select {
	padding: 8px 32px 8px 12px;
	border: 1px solid var(--theme--border-color, #e0e0e0);
	border-radius: 8px;
	background: var(--theme--background-normal, #fff);
	color: var(--theme--foreground, #333);
	font-size: 13px;
	outline: none;
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	background-image: url('data:image/svg+xml;utf8,<svg fill="gray" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
	background-repeat: no-repeat;
	background-position: right 6px center;
	transition: border-color 0.2s;
}
.cs-select:focus { border-color: var(--theme--primary, #6644ff); }
.cs-clear-btn {
	padding: 8px 16px;
	border: none;
	border-radius: 8px;
	background: var(--theme--danger-subdued, #ffe0e0);
	color: var(--theme--danger, #e53935);
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.2s;
}
.cs-clear-btn:hover { background: var(--theme--danger, #e53935); color: white; }

/* Grid */
.cs-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 24px;
}
@media (max-width: 1200px) { .cs-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 700px)  { .cs-grid { grid-template-columns: 1fr; } }

/* Card */
.cs-card {
	background: var(--theme--background-normal, #fff);
	border: 1px solid var(--theme--border-color-subdued, #e8e8e8);
	border-radius: 12px;
	padding: 20px;
	cursor: pointer;
	transition: all 0.2s ease;
	box-shadow: 0 2px 6px rgba(0,0,0,0.04);
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.cs-card:hover {
	transform: translateY(-3px);
	box-shadow: 0 8px 20px rgba(0,0,0,0.1);
	border-color: var(--theme--primary, #6644ff);
}
.cs-card-header {}
.cs-card-title {
	margin: 0;
	font-size: 15px;
	font-weight: 700;
	color: var(--theme--foreground, #333);
	line-height: 1.4;
}

/* Dates */
.cs-card-dates {
	display: flex;
	gap: 10px; /* Espacio entre los cuadros blancos */
	margin-top: 2px;
	/* Si quieres que el fondo de la tarjeta sea gris para que el blanco resalte más, 
	   puedes añadir un padding aquí o asegurar que .cs-card tenga un fondo gris muy tenue */
}
.cs-date-col {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex: 1;
	
	/* FONCO BLANCO PURO */
	background: #ffffff !important; 
	
	/* BORDE Y SOMBRA (Clave para el efecto de la foto) */
	border: 1px solid rgba(0, 0, 0, 0.05);
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
	
	border-radius: 10px;
	padding: 10px 12px;
	min-height: 72px;
	justify-content: center;
	align-items: center;
	text-align: center;
	transition: transform 0.2s ease;
}
.cs-date-label {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.6px;
	color: #9cb0c8;
}
.cs-date-value {
	font-size: 15px;
	font-weight: 600;
	color: var(--theme--foreground, #333);
	line-height: 1.2;
}

.cs-divider {
	border: none;
	border-top: 1px solid var(--theme--border-color-subdued, #eee);
	margin: 0;
}

/* Info lines */
.cs-info-lines {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.cs-info-line {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: var(--theme--foreground, #333);
}
.cs-info-icon { font-size: 14px; }
.cs-info-line strong { font-weight: 700; min-width: 60px; }

/* States */
.cs-loading, .cs-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 100px 24px;
	gap: 16px;
	color: var(--theme--foreground-subdued, #888);
}
</style>
