import ModuleComponent from './module.vue';

export default {
    id: 'media-explorer',
    name: 'Explorador de Medios',
    icon: 'perm_media',
    routes: [
        {
            path: '',
            component: ModuleComponent,
        },
    ],
};
