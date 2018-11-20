import Vue from 'vue';

// Vue Router
import VueRouter from 'vue-router';

Vue.use(VueRouter);

// Axios
import axios from 'axios';
import VueAxios from 'vue-axios';

Vue.use(VueAxios, axios);


// Bootstrap
import BootstrapVue from 'bootstrap-vue';

import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-vue/dist/bootstrap-vue.css';

Vue.use(BootstrapVue);


// Toastr - Notifications - https://github.com/chengxulvtu/cxlt-vue2-toastr/blob/master/README.en.md
import CxltToastr from 'cxlt-vue2-toastr';
import 'cxlt-vue2-toastr/dist/css/cxlt-vue2-toastr.css';

var toastrConfigs = {
    position: 'bottom right',
    showDuration: 2000
};
Vue.use(CxltToastr, toastrConfigs);


// own components:
import MapComponent from './components/map.vue';

// 1. Define route components.
const ComponentUserProfie = { template: '<div>User Profile</div>' };

// 2. Define some routes
const routes = [
    { path: '/map', component: MapComponent },
    { path: '/user', component: ComponentUserProfie },
];

// 3. Create the router instance and pass the `routes` option
const router = new VueRouter({
    routes // short for `routes: routes`
});

// main app
const vue = new Vue({
    router,
    el: '#app',
    components: {

    },
    data: {

    },
    methods: {

    },
    mounted () {

    }
});