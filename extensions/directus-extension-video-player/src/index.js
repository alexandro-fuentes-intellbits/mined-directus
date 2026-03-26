import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'gcs-video-player',
	name: 'GCS Video Player',
	icon: 'smart_display',
	description: 'Previsualiza y reproduce videos MP4 almacenados en Google Cloud Storage a través de Directus Assets',
	component: InterfaceComponent,
	types: ['uuid', 'string'],
	localTypes: ['file'],
	group: 'relational',
	relational: true,
	options: [
		{
			field: 'autoplay',
			name: 'Autoplay',
			type: 'boolean',
			meta: {
				interface: 'boolean',
				width: 'half',
			},
			schema: {
				default_value: false,
			},
		},
		{
			field: 'showControls',
			name: 'Mostrar Controles',
			type: 'boolean',
			meta: {
				interface: 'boolean',
				width: 'half',
			},
			schema: {
				default_value: true,
			},
		},
		{
			field: 'maxWidth',
			name: 'Ancho Máximo (px)',
			type: 'string',
			meta: {
				interface: 'input',
				width: 'half',
			},
			schema: {
				default_value: '100%',
			},
		},
		{
			field: 'aspectRatio',
			name: 'Relación de Aspecto',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				width: 'half',
				options: {
					choices: [
						{ text: '16:9', value: '16/9' },
						{ text: '4:3', value: '4/3' },
						{ text: '1:1', value: '1/1' },
						{ text: '21:9', value: '21/9' },
					],
				},
			},
			schema: {
				default_value: '16/9',
			},
		},
	],
});
