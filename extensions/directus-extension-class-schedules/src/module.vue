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
			<div class="cs-filters" v-if="allItems.length > 0 || hasActiveFilters">
				<select v-model="filterEscuela" class="cs-select" @change="onEscuelaChange">
					<option value="">Todas las Escuelas</option>
					<option v-for="opt in visibleSchoolOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
				</select>
				<select v-model="filterClase" class="cs-select" :disabled="!filterEscuela" @change="onAulaChange">
					<option value="">{{ classroomPlaceholderText }}</option>
					<option v-for="opt in classroomOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
				</select>
				<select v-model="filterProfesor" class="cs-select" :disabled="!filterClase" @change="onProfesorChange">
					<option value="">{{ filterClase ? 'Todos los Profesores' : 'Seleccione aula primero' }}</option>
					<option v-for="opt in teacherOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
				</select>
				<select v-model="filterMateria" class="cs-select" :disabled="!filterProfesor" @change="onMateriaChange">
					<option value="">{{ filterProfesor ? 'Todas las Materias' : 'Seleccione profesor primero' }}</option>
					<option v-for="opt in subjectOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
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
							<span>{{ displayValue(getClassroomLabel(item)) }}</span>
						</div>
						<div class="cs-info-line">
							<span class="cs-info-icon">📚</span>
							<strong>Materia:</strong>
							<span>{{ displayValue(getSubjectLabel(item)) }}</span>
						</div>
						<div class="cs-info-line">
							<span class="cs-info-icon">👩‍🏫</span>
							<strong>Profesor:</strong>
							<span>{{ displayValue(getTeacherLabel(item)) }}</span>
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

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { useRouter } from 'vue-router';

const api = useApi();
const router = useRouter();

const allItems = ref([]);
const loading = ref(false);
const localSearch = ref('');
const filterEscuela = ref('');
const filterClase = ref('');
const filterMateria = ref('');
const filterProfesor = ref('');
const schoolOptions = ref([]);
const classroomOptions = ref([]);
const teacherOptions = ref([]);
const subjectOptions = ref([]);
const classroomTotalFromApi = ref(0);

const COLLECTION = 'class_schedules_files';
const SCHEDULES_COLLECTION = 'class_schedules';
const CLASSROOMS_COLLECTION = 'classrooms';
const DEFAULT_LIMIT = 500;
const PAGE_SIZE = 200;
const LOG_PREFIX = '[class-schedules filters]';

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchItems() {
	if (loading.value) return;
	loading.value = true;
	try {
		const filter = {};
		if (filterEscuela.value) filter.class_schedule_id = { school_id: { _eq: filterEscuela.value } };
		if (filterClase.value) {
			filter.class_schedule_id = {
				...(filter.class_schedule_id || {}),
				classroom_id: { _eq: filterClase.value },
			};
		}
		if (filterProfesor.value) {
			filter.class_schedule_id = {
				...(filter.class_schedule_id || {}),
				teacher_id: { _eq: filterProfesor.value },
			};
		}
		if (filterMateria.value) {
			filter.class_schedule_id = {
				...(filter.class_schedule_id || {}),
				subject_id: { _eq: filterMateria.value },
			};
		}

		const res = await api.get(`/items/${COLLECTION}`, {
			params: {
				fields: [
					'*',
					'class_schedule_id.*',
					'class_schedule_id.school_id.*',
					'class_schedule_id.classroom_id.*',
					'class_schedule_id.teacher_id.*',
					'class_schedule_id.subject_id.*',
				],
				limit: DEFAULT_LIMIT,
				sort: '-date_created',
				filter,
			},
		});
		allItems.value = res.data?.data || [];
	} catch (e) {
		console.error('[class-schedules module]', e);
	} finally {
		loading.value = false;
	}
}

function getRelationId(value) {
	if (!value) return null;
	if (typeof value === 'object') return value.id || null;
	return String(value);
}

function getRelationLabel(value, keys = ['name', 'nickname', 'nombre', 'title', 'first_name']) {
	if (!value) return '--';
	if (typeof value === 'string') return value;
	if (typeof value === 'object') {
		for (const key of keys) {
			if (value[key]) return String(value[key]);
		}
	}
	return '--';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (s) =>
	(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const getSchedule = (item) => {
	if (!item || typeof item !== 'object') return null;
	if (item.class_schedule_id && typeof item.class_schedule_id === 'object') return item.class_schedule_id;
	return null;
};

const getClassroomLabel = (item) => {
	try {
		const schedule = getSchedule(item);
		return getRelationLabel(schedule?.classroom_id, ['nickname', 'name', 'nombre', 'title']);
	} catch (_) {}
	return '--';
};

const getSubjectLabel = (item) => {
	try {
		const schedule = getSchedule(item);
		return getRelationLabel(schedule?.subject_id, ['name', 'nombre', 'title']);
	} catch (_) {}
	return '--';
};

const getTeacherLabel = (item) => {
	try {
		const schedule = getSchedule(item);
		return getRelationLabel(schedule?.teacher_id, ['name', 'nickname', 'nombre', 'first_name']);
	} catch (_) {}
	return '--';
};

const displayValue = (val) => {
	if (val === undefined || val === null || val === '' || val === '--') return 'N/A';
	return val;
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
	const schedule = getSchedule(item);
	if (schedule) {
		const t = findTitle(schedule);
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
	const schedule = getSchedule(item);
	const startRaw = schedule?.start_date || item.start_date;
	const endRaw = schedule?.end_date || item.end_date;
	const created = item.date_created || schedule?.date_created;

	return [
		{ label: 'Creación', value: formatDate(created) },
		{ label: 'Inicio', value: formatDate(startRaw) },
		{ label: 'Fin', value: formatDate(endRaw) },
	];
};

const navigate = (item) => {
	router.push(`/content/${COLLECTION}/${item.id}`);
};

function uniqueOptionRows(rows, relationField, labelKeys) {
	const map = new Map();
	for (const row of rows) {
		const relation = row?.[relationField];
		const id = getRelationId(relation);
		if (!id || map.has(id)) continue;
		const label = getRelationLabel(relation, labelKeys);
		if (label && label !== '--') map.set(id, { id, label });
	}
	return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

const visibleSchoolOptions = computed(() => {
	if (schoolOptions.value.length > 0) return schoolOptions.value;
	const rows = (allItems.value || []).map((item) => getSchedule(item)).filter(Boolean);
	return uniqueOptionRows(rows, 'school_id', ['name', 'nombre', 'title']);
});

const classroomPlaceholderText = computed(() => {
	if (!filterEscuela.value) return 'Seleccione escuela primero';
	if (classroomTotalFromApi.value === 0) return 'No hay aulas para esta escuela';
	return `Todas las Aulas (${classroomTotalFromApi.value})`;
});

async function fetchSchoolOptions() {
	try {
		const allSchools = [];
		let page = 1;
		while (true) {
			const res = await api.get('/items/schools', {
				params: {
					limit: PAGE_SIZE,
					page,
				},
			});
			const rows = res.data?.data || [];
			allSchools.push(...rows);
			if (rows.length < PAGE_SIZE) break;
			page += 1;
		}

		schoolOptions.value = allSchools
			.map((school) => ({
				id: school.id,
				label: getRelationLabel(school, ['name', 'nombre', 'title']),
			}))
			.filter((option) => option.id && option.label !== '--')
			.sort((a, b) => a.label.localeCompare(b.label, 'es'));
		console.info(`${LOG_PREFIX} schools loaded (no filter):`, schoolOptions.value.length);
	} catch (e) {
		console.error('[class-schedules module] fetchSchoolOptions', e);
		schoolOptions.value = [];
	}
}

async function fetchClassroomOptions() {
	if (!filterEscuela.value) {
		classroomOptions.value = [];
		classroomTotalFromApi.value = 0;
		console.info(`${LOG_PREFIX} No school selected yet; classroom request skipped.`);
		return;
	}
	const params = {
		fields: ['id', 'name', 'nickname', 'nombre', 'title'],
		limit: DEFAULT_LIMIT,
		filter: { school_id: { _eq: filterEscuela.value } },
		sort: ['name', 'nickname'],
	};

	console.groupCollapsed(`${LOG_PREFIX} Fetch classrooms for school`);
	console.info('school_id:', filterEscuela.value);
	console.info('endpoint:', `/items/${CLASSROOMS_COLLECTION}`);
	console.info('params:', params);

	try {
		const res = await api.get(`/items/${CLASSROOMS_COLLECTION}`, {
			params,
		});
		const rows = res.data?.data || [];
		classroomTotalFromApi.value = rows.length;
		classroomOptions.value = rows
			.map((row) => ({
				id: row.id,
				label: getRelationLabel(row, ['nickname', 'name', 'nombre', 'title']),
			}))
			.filter((option) => option.id && option.label !== '--')
			.sort((a, b) => a.label.localeCompare(b.label, 'es'));
		console.info('total_classrooms_from_api:', rows.length);
		console.info('classroom_options:', classroomOptions.value);
		console.info(
			'manual_url_example:',
			`/items/${CLASSROOMS_COLLECTION}?filter[school_id][_eq]=${filterEscuela.value}&fields=id,name,nickname,nombre,title&limit=${DEFAULT_LIMIT}`
		);
	} catch (e) {
		console.error('[class-schedules module] fetchClassroomOptions', e);
		classroomOptions.value = [];
		classroomTotalFromApi.value = 0;
	} finally {
		console.groupEnd();
	}
}

async function fetchTeacherOptions() {
	if (!filterEscuela.value || !filterClase.value) {
		teacherOptions.value = [];
		return;
	}
	try {
		const res = await api.get(`/items/${SCHEDULES_COLLECTION}`, {
			params: {
				fields: ['teacher_id.id', 'teacher_id.name', 'teacher_id.nickname', 'teacher_id.nombre', 'teacher_id.first_name'],
				limit: DEFAULT_LIMIT,
				filter: {
					school_id: { _eq: filterEscuela.value },
					classroom_id: { _eq: filterClase.value },
				},
				sort: '-date_created',
			},
		});
		teacherOptions.value = uniqueOptionRows(res.data?.data || [], 'teacher_id', ['name', 'nickname', 'nombre', 'first_name']);
	} catch (e) {
		console.error('[class-schedules module] fetchTeacherOptions', e);
		teacherOptions.value = [];
	}
}

async function fetchSubjectOptions() {
	if (!filterEscuela.value || !filterClase.value || !filterProfesor.value) {
		subjectOptions.value = [];
		return;
	}
	try {
		const res = await api.get(`/items/${SCHEDULES_COLLECTION}`, {
			params: {
				fields: ['subject_id.id', 'subject_id.name', 'subject_id.nickname', 'subject_id.nombre', 'subject_id.title'],
				limit: DEFAULT_LIMIT,
				filter: {
					school_id: { _eq: filterEscuela.value },
					classroom_id: { _eq: filterClase.value },
					teacher_id: { _eq: filterProfesor.value },
				},
				sort: '-date_created',
			},
		});
		subjectOptions.value = uniqueOptionRows(res.data?.data || [], 'subject_id', ['name', 'nickname', 'nombre', 'title']);
	} catch (e) {
		console.error('[class-schedules module] fetchSubjectOptions', e);
		subjectOptions.value = [];
	}
}

async function onEscuelaChange() {
	filterClase.value = '';
	filterProfesor.value = '';
	filterMateria.value = '';
	classroomOptions.value = [];
	classroomTotalFromApi.value = 0;
	teacherOptions.value = [];
	subjectOptions.value = [];
	await fetchClassroomOptions();
	await fetchItems();
}

async function onAulaChange() {
	filterProfesor.value = '';
	filterMateria.value = '';
	teacherOptions.value = [];
	subjectOptions.value = [];
	await fetchTeacherOptions();
	await fetchItems();
}

async function onProfesorChange() {
	filterMateria.value = '';
	subjectOptions.value = [];
	await fetchSubjectOptions();
	await fetchItems();
}

async function onMateriaChange() {
	await fetchItems();
}

function forceRefresh() {
	if (filterEscuela.value) fetchClassroomOptions();
	if (filterEscuela.value && filterClase.value) fetchTeacherOptions();
	if (filterEscuela.value && filterClase.value && filterProfesor.value) fetchSubjectOptions();
	fetchItems();
}

const clearFilters = async () => {
	filterEscuela.value = '';
	filterClase.value = '';
	filterMateria.value = '';
	filterProfesor.value = '';
	localSearch.value = '';
	classroomOptions.value = [];
	classroomTotalFromApi.value = 0;
	teacherOptions.value = [];
	subjectOptions.value = [];
	await fetchItems();
};

onMounted(async () => {
	await fetchSchoolOptions();
	await fetchItems();
});

// ─── Computed filters ─────────────────────────────────────────────────────────
const hasActiveFilters = computed(() =>
	filterEscuela.value || filterClase.value || filterMateria.value || filterProfesor.value || localSearch.value
);

const filteredItems = computed(() => {
	return allItems.value.filter(item => {
		const clase    = getClassroomLabel(item);
		const materia  = getSubjectLabel(item);
		const profesor = getTeacherLabel(item);

		// Solo mostrar cards que tengan clase válida.
		if (!clase || clase === '--') return false;

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
.cs-select:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
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
