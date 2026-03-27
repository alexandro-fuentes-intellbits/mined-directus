import { defineLayout } from '@directus/extensions-sdk';
import LayoutComponent from './layout.vue';

export default defineLayout({
	id: 'friendly-layout',
	name: 'Vista Amigable',
	icon: 'view_agenda',
	component: LayoutComponent,
	slots: {
		options: () => null,
		sidebar: () => null,
		actions: () => null,
	},
	setup(props, { emit }) {
		return {
			name: 'Vista Amigable',
		};
	},
});
