<template>
    <div>
        <h1>Map</h1>

        <ul id="map-list-1">
            <li v-bind:key="tile.id" v-for="tile in tiles">
                {{ tile.x }} | {{ tile.y }}
            </li>
        </ul>
---
        <div id="map-layer-1">
            <div v-bind:key="tile.id" v-for="tile in layerZ" class="tile">
                {{ tile.x }} | {{ tile.y }}
            </div>
        </div>
    </div>
</template>

<script>
    module.exports = {
        props: [],
        data: function() {
            return {
                // will be a three-dimensional array with map coords
                tiles: [],
                targetZ: 0
            }
        },
        computed: {
            // https://stackoverflow.com/questions/41791482/filter-list-with-vue-js
            layerZ() {
                return this.tiles.filter(tile => {
                    return tile.z == this.targetZ;
                });
            }
        },
        methods: {

        },
        mounted () {
            this.axios
                // TODO: use global server config
                .get('http://localhost:41527/api/v1/map/demo',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => ( this.tiles = response.data))
                .catch(error => console.log(error));
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map.vue
</script>

<style>
.tile {
    display: block;
    width: 50px;
    height: 50px;
    background-color: green;
    margin: 2px;
}

</style>