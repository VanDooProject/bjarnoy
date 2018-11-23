<template>
    <div class="maplayer">
        <MapTile v-bind:tile=tile v-bind:key="tile.id" v-for="tile in layerZ"></MapTile>
    </div>
</template>

<script>
    import MapTile from './map_tile.vue';

    export default {
        props: ['tiles', 'layerZ'],
        data: function() {
            return {
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
        components: {
            MapTile
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_layer.vue
</script>

<style>

</style>