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
        imageMap: [],
        
        menuPos: {x:0, y:0},
        menuTile: {},
        menuVisible: false,
        menuClosed: false,

        mapOffset: {x: 0, y: 0},

        mouseMove: {x:0, y:0},
        techBildings: [],
        mapTiles: [],
    },
    getters: {
        menuDisplay: state => {
            return state.menuVisible == true ? "block" : "none";
        }
    },
    actions: {
        UpdateMapTiles (context) {
            console.log("update");
            axios
                .get(config.RequestUriPrefix + '/api/v1/map/tiles',
                {
                    headers: {'Authorization': "bearer " + localStorage.token},
                    withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                })
                .then(response => {
                    context.commit("SetMapTiles", response.data);
                })
                .catch(error => {
                    this.commit('ReqestErr', error);
                });
        },
        UpdateImageMap (context) {
            axios
                .get('/images/data.json',
                {
                    withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                })
                .then(response => {
                    context.commit("SetImageMap", response.data);
                })
                .catch(error => {
                    this.commit('ReqestErr');
                });
        },
        UpdateTechBildings (context) {
            axios
                .get(config.RequestUriPrefix + '/api/v1/Tech/buildings',
                {
                    headers: {'Authorization': "bearer " + localStorage.token},
                    withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                })
                .then(response => {
                    context.commit("SetTechBuildings", response.data);
                })
                .catch(error => {
                    this.commit('ReqestErr', error);
                });
        },
    },
    mutations: {
        SetMapTiles (state, tiles) {
            state.mapTiles = tiles;
        },
        SetImageMap (state, imageMap) {
            state.imageMap = imageMap;
        },
        SetTechBuildings (state, techBildings) {
            state.techBildings = techBildings;
        },
        logIn (state) {
            state.loggedIn = true;
        },
        ReqestErr (state, error) {
            state.loggedIn = false;
            //TODO Someting usefull with this
            console.log(error);
            if(localStorage.token)
                router.push("/login");
            else
                router.push("/register");
        },
        SetMenuPos (state, pos) {
            //Removing any unused poperties
            state.menuPos.x = pos.x;
            state.menuPos.y = pos.y;
        },
        SetMenuTile (state, tile) {
            state.menuTile = tile;
        },
        SetMenuVisible (state, visible) {
            state.menuVisible = visible;
        },
        SetMenuClosed (state, closed)
        {
            state.menuClosed = closed;
        },
        ClearMouseMove (state) {
            state.mouseMove = {x:0 , y: 0};
        },
        MouseMove (state, move) {
            state.mouseMove = {x: Math.abs(move.x) + state.mouseMove.x, y: Math.abs(move.y) + state.mouseMove.y};
            var angle = -45 * Math.PI / 180;
            state.mapOffset.x += move.x * Math.cos(angle) - move.y * 2 * Math.sin(angle);
            state.mapOffset.y += (move.y * 2 * Math.cos(angle) + move.x * Math.sin(angle));
        }
      }
});
store.dispatch("UpdateImageMap");
store.dispatch("UpdateTechBildings");

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