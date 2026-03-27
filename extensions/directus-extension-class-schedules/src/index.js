import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
	id: 'class-schedules',
	name: 'Horarios de Clases',
	icon: 'calendar_month',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
});
