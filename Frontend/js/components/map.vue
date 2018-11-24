// import MapLayer from './componments/map_layer.vue';


<template>
    <div>
        <h1>Map</h1>

        <MapMenu v-bind:pos="menu"></MapMenu>

        <!--
        <ul id="map-list-1">
            <li v-bind:key="tile.id" v-for="tile in tiles">
                {{ tile.x }} | {{ tile.y }}
            </li>
        </ul>
        -->

        <div id="map">
            <MapLayer layerZ="1" v-bind:tiles="tiles" @tile_clicked="gotEvent"></MapLayer>
            <MapLayer layerZ="2" v-bind:tiles="tiles" @tile_clicked="gotEvent"></MapLayer>
        </div>
    </div>
</template>

<script>
    import MapLayer from './map_layer.vue';
    import MapMenu from './menu.vue';

    export default {
        props: [],
        data: function() {
            return {
                // will be a three-dimensional array with map coords
                tiles: [],
                menu: {x:0, y:0}
            }
        },
        mounted () {
            this.axios
                // TODO: use global server config
                .get(this.$config.RequestUriPrefix + '/api/v1/map/demo/10',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => ( this.tiles = response.data))
                .catch(error => console.log(error));
        },
        methods: {
            gotEvent: function(event) {
                this.menu.x = event.pageX;
                this.menu.y = event.pageY;
            }
        },
        components: {
            MapLayer,
            MapMenu
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map.vue
</script>

<style>


</style>