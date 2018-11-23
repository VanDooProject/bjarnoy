
// import MapLayer from './componments/map_layer.vue';


<template>
    <div>
        <h1>Map</h1>

        <!--
        <ul id="map-list-1">
            <li v-bind:key="tile.id" v-for="tile in tiles">
                {{ tile.x }} | {{ tile.y }}
            </li>
        </ul>
        -->

        <div id="map">
            <MapLayer layerZ="0" v-bind:tiles="tiles"></MapLayer>
        </div>

    </div>
</template>

<script>
    import MapLayer from './map_layer.vue';

    export default {
        props: [],
        data: function() {
            return {
                // will be a three-dimensional array with map coords
                tiles: [],
            }
        },
        mounted () {
            this.axios
                // TODO: use global server config
                .get('http://localhost:41527/api/v1/map/demo/10',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => ( this.tiles = response.data))
                .catch(error => console.log(error));
        },
        components: {
            MapLayer
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map.vue
</script>

<style>


</style>