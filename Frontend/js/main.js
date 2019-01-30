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

//SignalR
var signalR = require('@aspnet/signalr')


// own components:
import MapComponent from './components/map.vue';
import GameHeader from './components/gameHeader.vue';
import LoginForm from './components/forms/login_form.vue';
import RegisterForm from './components/forms/register_form.vue';
import UserProfie from './components/user_profile.vue';
import { HttpTransportType, LogLevel } from '@aspnet/signalr';


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

const store = new Vuex.Store({
    state: {
        loggedIn: false,
        imageMap: [],
        
        menuPos: {x:0, y:0},
        menuTile: {},
        menuVisible: false,
        menuClosed: false,
        menuBuildOpen: false,

        mapOffset: {x: 0, y: 0},

        mouseMove: {x:0, y:0},
        techBildings: [],
        mapTiles: [],
        queued: [],
        now: new Date(),
        websocket: undefined,
        deltaTime: 0,
    },
    getters: {
        menuDisplay: state => {
            return state.menuVisible == true ? "block" : "none";
        }
    },
    actions: {
        Tick(context) //Gets called every 60 seconds
        {
            if(localStorage.token != undefined)
            {
                var date = new Date();
                var now = Math.round(date.getTime()/1000);
                var token = jwtDecode(localStorage.token);
                var expires = token.exp;
                var notBefore = token.nbf;
                if((expires - now) < ((expires - notBefore) / 2) && (expires - now) > 0)
                {
                    axios
                    .get(config.RequestUriPrefix + '/api/v1/auth/refresh',
                    {
                        headers: {'Authorization': "bearer " + localStorage.token},
                    })
                    .then(response => localStorage.token = response.data.token)
                    .catch(error => store.dispatch("ReqestError", error));
                }
            }
        },
        Startup (context)
        {
            if(localStorage.token == undefined)
            {
                router.push("/login")
            }
            else
            {
                var date = new Date();
                var now = Math.round(date.getTime()/1000);
                var token = jwtDecode(localStorage.token);
                var expires = token.exp;
                var notBefore = token.nbf;
                if((expires - now) > 0 | now < notBefore)
                {
                    console.info("token found, trying it");
                    context.dispatch("Login", localStorage.token);
                }
                else
                {
                    console.info("Token not valid, deleted");
                    localStorage.removeItem("token");
                    router.push("/login");
                }
            }
        },
        StartWebSocket(context)
        {
            if(context.state.websocket != undefined && context.state.websocket.connectionState == 0)
            {
                console.log("starting websocket");
                context.state.websocket.start()
                .then(() => {
                    context.state.websocket.on("Queue", function (queue) {
                        context.dispatch("UpdateQueued");
                        if(queue.startsWith("BuildingQueue"))
                        {
                            context.dispatch("UpdateMapTiles");
                        }
                        return console.info("got Queue: " + queue);
                    });
    
                    context.state.websocket.invoke("GetServerTime").then(function (res) {
                        context.commit("SetDeltaTime", new Date().getTime() - new Date(res).getTime());
                        
                        return console.info("got servertime: " + res + " Diff: " + context.state.deltaTime);
                    })
                    .catch(function (err) {
                        return console.error(err.toString());
                    });
                })
                .catch(err => context.dispatch("ErrorWebSocket", err));
            }
        },
        ErrorWebSocket (context, error) {
            console.error(error);
        },
        UpdateMapTiles (context) {
            axios
                .get(config.RequestUriPrefix + '/api/v1/map/tiles',
                {
                    headers: {'Authorization': "bearer " + localStorage.token},
                })
                .then(response => {
                    context.commit("SetMapTiles", response.data);
                })
                .catch(error => {
                    this.commit('ReqestErr', error);
                });
        },
        UpdateQueued (context) {
            axios
                .get(config.RequestUriPrefix + '/api/v1/Queue/my',
                {
                    headers: {'Authorization': "bearer " + localStorage.token},
                })
                .then(response => {
                    context.commit("SetQueued", response.data);
                })
                .catch(error => {
                    this.commit('ReqestErr', error);
                });
        },
        UpdateImageMap (context) {
            axios
                .get('/images/data.json')
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
                })
                .then(response => {
                    context.commit("SetTechBuildings", response.data);
                })
                .catch(error => {
                    this.commit('ReqestErr', error);
                });
        },
        Login (context, token){
            //Make shure the token actualy works
            axios
                .get(config.RequestUriPrefix + '/api/v1/auth/selftest',
                    {
                        headers: {'Authorization': "bearer " + token},
                    })
                .then(response => {
                    if(context.state.websocket == undefined)
                    {
                        context.state.websocket = new signalR.HubConnectionBuilder()
                            .withUrl(config.WsUriPrefix + "/api/ws",
                            {
                                accessTokenFactory: () => localStorage.token
                            }
                            ).configureLogging(LogLevel.Debug).build()
                    }
                    localStorage.token = token;
                    context.dispatch("StartWebSocket");
                    //context.state.websocket.invoke("SendMessage", "usr", "Hello World");
                    context.commit("logIn"); 
                    context.dispatch("UpdateTechBildings");
                    context.dispatch("UpdateQueued");
                    router.push("/map");
                })
                .catch(error => console.log(error));
        },
        Logout (context)
        {
            context.state.websocket.stop();
            context.state.websocket = undefined;
            localStorage.removeItem("token");
            context.commit("logOut");
            router.push("/login");
        },
        ReqestError (context, error) {
            //if not logged in
            if(error.status == "401") {
                context.commit("logOut");
                if(localStorage.token)
                    router.push("/login");
                else
                    router.push("/register");
            }
            else
            {
                console.error(error);
            }
        }
    },
    mutations: {
        SetDeltaTime (state, dT) {
            state.deltaTime = dT;
        },
        SetMapTiles (state, tiles) {
            state.mapTiles = tiles;
        },
        SetQueued (state, queue) {
            state.queued = queue;
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
        logOut (state) {
            state.loggedIn = false;
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
            state.menuBuildOpen = false;
        },
        ClearMouseMove (state) {
            state.mouseMove = {x:0 , y: 0};
        },
        MouseMove (state, move) {
            state.mouseMove = {x: Math.abs(move.x) + state.mouseMove.x, y: Math.abs(move.y) + state.mouseMove.y};
            var angle = -45 * Math.PI / 180;
            state.mapOffset.x += move.x * Math.cos(angle) - move.y * 2 * Math.sin(angle);
            state.mapOffset.y += (move.y * 2 * Math.cos(angle) + move.x * Math.sin(angle));
        },
        OpenBuildMenu (state) {
            state.menuBuildOpen = true;
        },
        SetCurrentTime(state, time)
        {
            state.now = time;
        }
      }
});
store.dispatch("UpdateImageMap");
store.dispatch("StartWebSocket");
store.dispatch("Startup");

var lastTick = 0;
function callback()
{
    store.commit("SetCurrentTime", new Date() - store.state.deltaTime);
    if(lastTick++ > 60)
    {
        lastTick = 0;
        store.dispatch("Tick");
    }
}
setInterval(callback, 1000);

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