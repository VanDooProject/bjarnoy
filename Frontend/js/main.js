import Vue from 'vue';
import config from './config.js';

import store from './store';

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
export const router = new VueRouter({
    routes // short for `routes: routes`
});

//https://stackoverflow.com/questions/38552003/how-to-decode-jwt-token-in-javascript
function jwtDecode(token){
    return JSON.parse(
        decodeURIComponent(
        Array.prototype.map.call(atob(
        token.split('.')[1].replace('-', '+').replace('_', '/')
        ), c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''))
    )
}


Vue.prototype.$config = config;

store.dispatch("StartWebSocket");
store.dispatch("Startup");

var lastTick = 0;
function callback()
{
    store.commit("SetCurrentTime", new Date() - store.state.deltaTime);
    store.dispatch("Tick1s");
    if(lastTick++ > 60)
    {
        lastTick = 0;
        store.dispatch("Tick60s");
    }
}
setInterval(callback, 1000);

function resizeEvent()
{
    store.commit("SetWindowSize", {x: window.innerWidth, y: window.innerHeight});
    store.commit("SetMenuVisible", false);
}
window.addEventListener("resize", resizeEvent);

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