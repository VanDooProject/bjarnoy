import Vue from 'vue';
import config from './config.js';

// Vuex
import Vuex from 'vuex';

Vue.use(Vuex);

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
import GameHeader from './components/gameHeader.vue';
import LoginForm from './components/forms/login_form.vue';
import RegisterForm from './components/forms/register_form.vue';
import UserProfie from './components/user_profile.vue';


// 1. Define route components.

// 2. Define some routes
const routes = [
    { path: '/map', component: MapComponent },
    { path: '/user', component: UserProfie },
    { path: '/login', component: LoginForm },
    { path: '/register', component: RegisterForm },
];

// 3. Create the router instance and pass the `routes` option
const router = new VueRouter({
    routes // short for `routes: routes`
});



Vue.prototype.$config = config;

const store = new Vuex.Store({
    state: {
        loggedIn: false,
        imageMap: undefined,
      },
      mutations: {
        logIn (state) {
            state.loggedIn = true;
        },
        ReqestErr (state) {
            state.loggedIn = false;
            if(localStorage.token)
                router.push("/login");
            else
                router.push("/register");
        },
        UpdateImageMap (state) {
            axios
                .get('/images/data.json',
                {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                })
                .then(response => {
                    store.imageMap = response.data;
                })
                .catch(error => {
                    store.commit('ReqestErr');
                });
        }
      }
});
store.commit("UpdateImageMap");

// main app
const vue = new Vue({
    router,
    el: '#app',
    components: {
        'gameheader':GameHeader
    },
    store,
    data: {

    },
    methods: {

    },
    mounted () {

    }
});