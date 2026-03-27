<template>
	<div class="friendly-layout-wrapper">
		<!-- Barra de herramientas con Filtros Custom -->
		<div class="friendly-toolbar" v-if="items[collectionName] && items[collectionName].length > 0">
			<div class="filters-row">
				<select v-model="filterClase" class="filter-select">
					<option value="">Todas las Clases</option>
					<option v-for="opt in uniqueClases" :key="opt" :value="opt">{{ opt }}</option>
				</select>
				<select v-model="filterMateria" class="filter-select">
					<option value="">Todas las Materias</option>
					<option v-for="opt in uniqueMaterias" :key="opt" :value="opt">{{ opt }}</option>
				</select>
				<select v-model="filterProfesor" class="filter-select">
					<option value="">Todos los Profesores</option>
					<option v-for="opt in uniqueProfesores" :key="opt" :value="opt">{{ opt }}</option>
				</select>
			</div>
			<div class="search-box">
				<span class="search-icon">🔍</span>
				<input type="text" v-model="localSearch" class="search-input" placeholder="Buscar texto..." />
			</div>
		</div>

		<div class="friendly-layout-container">
			<!-- Mostrar cargando solo si es la primera vez y el cache está vacío -->
			<div v-if="loading && (!items[collectionName] || items[collectionName].length === 0)" class="no-items">Cargando elementos...</div>
			<div v-else-if="error" class="no-items">Error: {{ error.message }}</div>
			
			<!-- Renderizar el listado filtrado -->
			<router-link 
				v-for="item in filteredItems" 
				:key="item.id || Math.random()" 
				:to="`/content/${collectionName}/${item.id}`" 
				class="friendly-card"
			>
			<div class="friendly-card-header">
				<h3 class="friendly-card-title">{{ getTitle(item) }}</h3>
				<span v-if="getStatus(item)" class="friendly-badge" :style="{ backgroundColor: getStatus(item).color }">
					{{ getStatus(item).label }}
				</span>
			</div>
			<div class="friendly-card-body">
				<div class="card-columns">
					<div class="card-column" v-for="(detail, index) in getDetails(item)" :key="index">
						<span class="card-column-label">{{ detail.label }}</span>
						<span class="card-column-value">{{ detail.value }}</span>
					</div>
				</div>
                <hr class="friendly-divider" />
				<div class="friendly-info-line">
					<span class="icon">📌</span> <strong>Clase:</strong> <span class="info-text">{{ getInfoField(item, ['classroom_id', 'class_id', 'clase', 'name', 'title', 'nombre']) }}</span>
				</div>
				<div class="friendly-info-line">
					<span class="icon">📚</span> <strong>Materia:</strong> <span class="info-text">{{ getInfoField(item, ['subject_id', 'materia_id', 'materia', 'curso', 'course', 'subject', 'modulo']) }}</span>
				</div>
				<div class="friendly-info-line">
					<span class="icon">👩‍🏫</span> <strong>Profesor:</strong> <span class="info-text">{{ getInfoField(item, ['teacher_id', 'profesor_id', 'profesor', 'teacher', 'docente', 'instructor']) }}</span>
				</div>
			</div>
		</router-link>

		<div v-if="!loading && filteredItems.length === 0 && (items[collectionName] && items[collectionName].length > 0)" class="no-items">
			No se encontraron resultados para "{{ localSearch }}"
		</div>
		<div v-else-if="!loading && (!items[collectionName] || items[collectionName].length === 0)" class="no-items">
			No hay elementos para mostrar en esta vista.
		</div>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, toRefs, ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { useItems } from '@directus/extensions-sdk';

// Caché global en memoria del módulo para que los items persistan al navegar entre rutas
const layoutCache = ref<{ [collectionName: string]: any[] }>({});
const scrollCache = ref<{ [collectionName: string]: number }>({});

export default defineComponent({
	props: {
		collection: {
			type: String,
			required: true,
		},
		search: {
			type: String,
			default: null,
		},
        filter: {
			type: Object,
			default: null,
		},
	},
	setup(props) {
		const { collection, search, filter } = toRefs(props);
        
        // Fetch up to 2 levels deep to assure we find the class name
        const { items, loading, error } = useItems(collection, {
            fields: ref(['*', '*.*', '*.*.*']),
            limit: ref(200),
            sort: ref(['-date_created']),
            filter,
            search,
        });

		// Mantener sincronizado el caché cuando se obtienen nuevos items
		watch(items, (newItems) => {
			if (newItems && newItems.length > 0) {
				console.log('✨ DATOS RECIBIDOS DESDE DIRECTUS (RAW DATA) ✨');
				console.log(JSON.parse(JSON.stringify(newItems)));
				layoutCache.value[collection.value] = [...newItems];
			}
		}, { deep: true, immediate: true });

		const handleScroll = (e: any) => {
			const target = e.target as HTMLElement;
			// Capturamos el scroll del contenedor principal real
			const scrollVal = target.scrollTop || window.scrollY || 0;
			// Solo actualizamos si es un valor real (para evitar que directus resetee a 0 al salir)
			if (scrollVal > 0) {
				scrollCache.value[collection.value] = scrollVal;
			}
		};

		// Restaurar scroll al volver a la vista
		onMounted(() => {
			const savedScroll = scrollCache.value[collection.value];
			if (savedScroll) {
				// Reintentamos el scroll varias veces porque Directus a veces resetea el scroll después del mounted
				let attempts = 0;
				const tryScroll = () => {
					attempts++;
					const mainContent = document.getElementById('main-content');
					if (mainContent) mainContent.scrollTop = savedScroll;
					window.scrollTo(0, savedScroll);
					
					if (attempts < 5) {
						setTimeout(tryScroll, 100);
					}
				};
				setTimeout(tryScroll, 50);
			}

			// Escuchamos el scroll de forma activa (fase de captura)
			window.addEventListener('scroll', handleScroll, true);
		});

		// Limpiar event listener
		onBeforeUnmount(() => {
			window.removeEventListener('scroll', handleScroll, true);
		});

		// Búsqueda profunda para encontrar un string descriptivo (el nombre de la clase)
		const findDescriptiveString = (obj: any, depth = 0): string | null => {
			if (depth > 3 || !obj || typeof obj !== 'object') return null;
			
			// Primero buscamos propiedades explícitas
			if (obj.clase && typeof obj.clase === 'string') return obj.clase;
			if (obj.name && typeof obj.name === 'string') return obj.name;
			if (obj.title && typeof obj.title === 'string') return obj.title;
			if (obj.nombre && typeof obj.nombre === 'string') return obj.nombre;

			// Luego buscamos cualquier string largo que parezca un título
			const values = Object.values(obj);
			const str = values.find(v => typeof v === 'string' && v.length > 10 && !String(v).includes('-'));
			if (str && typeof str === 'string') {
				const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
				if (!isUUID) return str;
			}

			// Si no, iteramos sobre objetos hijos
			for (const key in obj) {
				if (typeof obj[key] === 'object' && obj[key] !== null) {
					const res = findDescriptiveString(obj[key], depth + 1);
					if (res) return res;
				}
			}

			return null;
		};

		const getTitle = (item: any) => {
			if (item.class_schedule_id && typeof item.class_schedule_id === 'object') {
				const descriptive = findDescriptiveString(item.class_schedule_id);
				if (descriptive) return descriptive;
			}
			const descriptiveItem = findDescriptiveString(item);
			if (descriptiveItem) return descriptiveItem;

			return 'Clase Sin Título';
		};

		// ---------------- UI/UX Enhancements ----------------

		const formatKey = (key: any) => {
			if (!key) return '';
			if (typeof key !== 'string') return String(key);
			return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
		}

		const getStatus = (item: any) => {
			try {
				if (!item.status) return null;
				const isPublished = String(item.status).toLowerCase() === 'published';
				return {
					label: formatKey(item.status),
					color: isPublished ? 'var(--theme--success, #28c76f)' : 'var(--theme--warning, #ff9f43)'
				};
			} catch (e) { return null; }
		};

		const getInfoField = (item: any, possibleKeys: string[]) => {
			try {
				// Buscamos primero en el registro raíz (por si "teacher_id" viene directamente aquí)
				for (const key of possibleKeys) {
					if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
						if (typeof item[key] === 'object' && !Array.isArray(item[key])) {
							return item[key].nickname || item[key].name || item[key].nombre || item[key].first_name || item[key].title || item[key].clase || '-';
						}
						return String(item[key]);
					}
				}

				// Luego buscamos dentro de la relación class_schedule_id (anidado)
				const obj = item.class_schedule_id;
				if (obj && typeof obj === 'object') {
					for (const key of possibleKeys) {
						if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
							if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
								return obj[key].nickname || obj[key].name || obj[key].nombre || obj[key].first_name || obj[key].title || obj[key].clase || '-';
							}
							return String(obj[key]);
						}
					}
				}
			} catch(e) {}
			return '--';
		};

		const getDetails = (item: any) => {
			try {
				return [
					{ label: 'Creación', value: formatValue(item.date_created) },
					{ label: 'Inicio', value: formatValue(item.start_date) },
					{ label: 'Fin', value: formatValue(item.end_date) }
				];
			} catch (e) {
				return [];
			}
		};

		const formatValue = (value: any) => {
			try {
				if (!value) return '--';
				if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
					return new Date(value).toLocaleString('es-ES', { 
						year: 'numeric', month: 'short', day: 'numeric', 
						hour: '2-digit', minute:'2-digit' 
					});
				}
				return String(value);
			} catch (e) { return '--'; }
		};

		const localSearch = ref('');
		const filterClase = ref('');
		const filterMateria = ref('');
		const filterProfesor = ref('');

		const removeAccents = (str: string) => {
			return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
		};

		const uniqueClases = computed(() => {
			const rawItems = layoutCache.value[collection.value] || [];
			const set = new Set(rawItems.map((i: any) => getInfoField(i, ['classroom_id', 'class_id', 'clase', 'name', 'title', 'nombre'])));
			return Array.from(set).filter(v => v !== '--').sort();
		});

		const uniqueMaterias = computed(() => {
			const rawItems = layoutCache.value[collection.value] || [];
			const set = new Set(rawItems.map((i: any) => getInfoField(i, ['subject_id', 'materia_id', 'materia', 'curso', 'course', 'subject', 'modulo'])));
			return Array.from(set).filter(v => v !== '--').sort();
		});

		const uniqueProfesores = computed(() => {
			const rawItems = layoutCache.value[collection.value] || [];
			const set = new Set(rawItems.map((i: any) => getInfoField(i, ['teacher_id', 'profesor_id', 'profesor', 'teacher', 'docente', 'instructor'])));
			return Array.from(set).filter(v => v !== '--').sort();
		});

		const filteredItems = computed(() => {
			const rawItems = layoutCache.value[collection.value] || [];
			
			return rawItems.filter((item: any) => {
				const clase = getInfoField(item, ['classroom_id', 'class_id', 'clase', 'name', 'title', 'nombre']);
				const materia = getInfoField(item, ['subject_id', 'materia_id', 'materia', 'curso', 'course', 'subject', 'modulo']);
				const profesor = getInfoField(item, ['teacher_id', 'profesor_id', 'profesor', 'teacher', 'docente', 'instructor']);
				
				// Filtros Dropdown strictos
				if (filterClase.value && filterClase.value !== clase) return false;
				if (filterMateria.value && filterMateria.value !== materia) return false;
				if (filterProfesor.value && filterProfesor.value !== profesor) return false;

				// Búsqueda de texto (insensible a acentos/tildes)
				if (localSearch.value && localSearch.value.trim() !== '') {
					const query = removeAccents(localSearch.value.toLowerCase().trim());
					const sTitle = removeAccents(getTitle(item).toLowerCase());
					const sClase = removeAccents(clase.toLowerCase());
					const sMateria = removeAccents(materia.toLowerCase());
					const sProf = removeAccents(profesor.toLowerCase());
					
					if (!sTitle.includes(query) && !sClase.includes(query) && !sMateria.includes(query) && !sProf.includes(query)) {
						return false;
					}
				}

				return true;
			});
		});

		return {
			items: layoutCache,
			collectionName: collection,
            loading,
            error,
			getTitle,
			getStatus,
			getDetails,
			getInfoField,
			formatValue,
			localSearch,
			filterClase,
			filterMateria,
			filterProfesor,
			uniqueClases,
			uniqueMaterias,
			uniqueProfesores,
			filteredItems
		};
	},
});
</script>

<style scoped>
.friendly-layout-wrapper {
	display: flex;
	flex-direction: column;
	min-height: 100%;
	background-color: var(--theme--background, #f4f6f8);
}
.friendly-toolbar {
	padding: 24px 24px 0 24px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
	flex-wrap: wrap;
}
.filters-row {
	display: flex;
	gap: 12px;
	flex-grow: 1;
	flex-wrap: wrap;
}
.filter-select {
	padding: 8px 32px 8px 12px;
	border: 1px solid var(--theme--border-color, #e0e0e0);
	border-radius: 8px;
	background: var(--theme--background-normal, #ffffff);
	color: var(--theme--foreground, #333);
	font-size: 13px;
	outline: none;
	cursor: pointer;
    background-image: url('data:image/svg+xml;utf8,<svg fill="black" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>');
    background-repeat: no-repeat;
    background-position-x: calc(100% - 6px);
    background-position-y: center;
    appearance: none;
	-webkit-appearance: none;
}
.search-box {
	position: relative;
	width: 100%;
	max-width: 300px;
	display: flex;
	align-items: center;
}
.search-icon {
	position: absolute;
	left: 14px;
	font-size: 14px;
	color: var(--theme--foreground-subdued, #888);
}
.search-input {
	width: 100%;
	padding: 10px 16px 10px 38px;
	border: 1px solid var(--theme--border-color, #e0e0e0);
	border-radius: 20px;
	background: var(--theme--background-normal, #ffffff);
	color: var(--theme--foreground, #333);
	font-size: 14px;
	outline: none;
	transition: all 0.2s;
}
.search-input:focus {
	border-color: var(--theme--primary, #6644ff);
	box-shadow: 0 0 0 3px rgba(102, 68, 255, 0.15);
}

.friendly-layout-container {
	padding: 24px;
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 24px;
}

@media (max-width: 1400px) {
    .friendly-layout-container {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 800px) {
    .friendly-layout-container {
        grid-template-columns: 1fr;
    }
}
.friendly-card {
	background: var(--theme--background-normal, #ffffff);
	border: 1px solid var(--theme--border-color, #e0e0e0);
	border-radius: var(--theme--border-radius, 8px);
	padding: 20px;
	box-shadow: 0 4px 12px rgba(0,0,0,0.05);
	display: flex;
	flex-direction: column;
	transition: transform 0.2s ease, box-shadow 0.2s ease;
	text-decoration: none;
	color: inherit;
	cursor: pointer;
}
.friendly-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 16px rgba(0,0,0,0.08);
	border-color: var(--theme--primary, #6644ff);
}
.friendly-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}
.friendly-card-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--theme--primary, #6644ff);
	line-height: 1.4;
	white-space: normal;
	word-wrap: break-word;
	flex-grow: 1;
}
.friendly-badge {
    padding: 4px 10px;
    border-radius: 12px;
    color: white;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    white-space: nowrap;
	flex-shrink: 0;
}
.friendly-card-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 16px;
}
.friendly-info-line {
    font-size: 13px;
    color: var(--theme--foreground-subdued, #666666);
    display: flex;
    align-items: flex-start;
    gap: 8px;
	line-height: 1.4;
}
.friendly-info-line strong {
	color: var(--theme--foreground, #333);
	font-weight: 600;
	min-width: 60px;
}
.info-text {
	color: var(--theme--primary, #6644ff);
	font-weight: 500;
}
.card-columns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 4px;
}
.card-column {
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--theme--background, #f4f6f8);
    padding: 8px;
    border-radius: 6px;
    text-align: center;
}
.card-column-label {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--theme--foreground-subdued, #888888);
    font-weight: 700;
}
.card-column-value {
    font-size: 12px;
    color: var(--theme--foreground, #333333);
    font-weight: 500;
    margin-top: 4px;
    line-height: 1.3;
}
.friendly-divider {
    border: 0;
    border-top: 1px dashed var(--theme--border-color-subdued, #f0f0f0);
    margin: 6px 0;
}
.no-items {
	padding: 40px;
	text-align: center;
	color: var(--theme--foreground-subdued, #888);
	font-size: 16px;
	grid-column: 1 / -1;
}
</style>
