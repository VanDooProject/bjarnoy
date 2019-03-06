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
        
        menuPos: {x:0, y:0},
        menuTile: {},
        menuVisible: false,
        menuClosed: false,
        menuBuildOpen: false,

        mapOffset: {x: -window.innerWidth/2, y: -window.innerHeight/2},
        mapScale: 1,

        mouseMove: {x:0, y:0},
        techBildings: [],
        mapTiles: [],
        queued: [],
        now: new Date(),
        websocket: undefined,
        deltaTime: 0,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        userResources: undefined,
    },
    getters: {
        menuDisplay: state => {
            return state.menuVisible == true ? "block" : "none";
        }
    },
    actions: {
        Tick60s(context) //Gets called every 60 seconds
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
                    .catch(error => context.dispatch("ReqestError", error));
                }
            }
        },
        Tick1s(context)
        {
            if(context.state.userResources != undefined)
            {
                context.commit("calcUserResources");
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
                        context.dispatch("UpdateResources");
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
        UpdateResources (context) {
            axios
                .get(config.RequestUriPrefix + '/api/v1/Resource/user',
                {
                    headers: {'Authorization': "bearer " + localStorage.token},
                })
                .then(response => {
                    context.commit("SetResources", response.data);
                })
                .catch(error => {
                    context.dispatch('ReqestError', error);
                });
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
                    context.dispatch('ReqestError', error);
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
                    context.dispatch('ReqestError', error);
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
                    context.dispatch('ReqestError', error);
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
                    context.dispatch("UpdateResources");
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
        SetWindowSize (state, size) {
            state.windowWidth = size.x;
            state.windowHeight = size.y;
        },
        AddMapScale (state, dScale)
        {
            state.mapScale = Math.min(Math.max(state.mapScale + dScale, 0.05), 3); //Clamping scale to max 3 and min 0.05
        },
        SetDeltaTime (state, dT) {
            state.deltaTime = dT;
        },
        SetMapTiles (state, tiles) {
            state.mapTiles = tiles.sort((a,b) => {
                //Sort list when adding instead of using zIndex
                return a.position.x - a.position.y - (b.position.x - b.position.y);
            });
        },
        calcUserResources(state) {
            //Make sure that the time alway exists (Should not be needed after some changes in the backend)
            if(state.userResources.LastResourceStorageRefresh==undefined){
                state.userResources.LastResourceStorageRefresh=state.now;
                return;
            }

            //Resource update calculations
            var hoursSinceLastCalculation = (state.now - state.userResources.LastResourceStorageRefresh)/3600000 ;// /1000 => s , /60=> min, /60=> h Ges: 3600000
            state.userResources.LastResourceStorageRefresh=state.now;

            state.userResources.resourcesStoredCurrently.wood = Math.min(
                state.userResources.resourceStorageCapacity.wood,
                state.userResources.resourcesStoredCurrently.wood +
                    state.userResources.hourlyResourceProduction.stone * hoursSinceLastCalculation);

            state.userResources.resourcesStoredCurrently.stone = Math.min(
                state.userResources.resourceStorageCapacity.stone,
                state.userResources.resourcesStoredCurrently.stone + 
                    state.userResources.hourlyResourceProduction.stone * hoursSinceLastCalculation);

            state.userResources.resourcesStoredCurrently.iron = Math.min(
                state.userResources.resourceStorageCapacity.iron,
                state.userResources.resourcesStoredCurrently.iron +
                    state.userResources.hourlyResourceProduction.iron * hoursSinceLastCalculation);

            state.userResources.resourcesStoredCurrently.gold = Math.min(
                state.userResources.resourceStorageCapacity.gold,
                state.userResources.resourcesStoredCurrently.gold + 
                    state.userResources.hourlyResourceProduction.gold * hoursSinceLastCalculation);
                        
        },
        SetResources( state, resources) {
            state.userResources = resources;
        },
        SetQueued (state, queue) {
            state.queued = queue;
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
            state.mapOffset.x += move.x;
            state.mapOffset.y += move.y;
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