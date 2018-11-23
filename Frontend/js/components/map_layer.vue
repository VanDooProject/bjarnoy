<template>
    <div class="maplayer"
        >
        <!--
        v-bind:style="{
                height: Math.round(Math.sqrt(this.tiles.length)) * 60 + 'px',
                width: Math.round(Math.sqrt(this.tiles.length)) * 60 + 'px'
            }"
        -->
        <MapTile v-bind:tile=tile v-bind:key="tile.id" v-for="tile in FilterLayerZ"></MapTile>
    </div>
</template>

<script>
    import MapTile from './map_tile.vue';

    export default {
        props: ['tiles', 'layerZ'],
        data: function() {
            return {
                // tiles: [],
                // targetZ: 0
            }
        },
        computed: {
            // https://stackoverflow.com/questions/41791482/filter-list-with-vue-js
            FilterLayerZ() {
                return this.tiles.filter(tile => {
                    return tile.z == this.layerZ;
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
.maplayer {
    display: block;

    position: absolute;

/*
    background-color: burlywood;

    padding: 20px;
*/
}

</style>