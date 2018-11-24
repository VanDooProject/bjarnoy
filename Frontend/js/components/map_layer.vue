<template>
    <div class="maplayer"
            v-bind:style="{
                transform: 'scale(' + scalingFactor + ')',
                left: globalMapOffset.x * scalingFactor + 'px',
                top:  globalMapOffset.y * scalingFactor + 'px',
            }"
             
        >
        <!--
        v-bind:style="{
                height: Math.round(Math.sqrt(this.tiles.length)) * 60 + 'px',
                width: Math.round(Math.sqrt(this.tiles.length)) * 60 + 'px'
            }"
        -->
        <MapTile v-bind:tile=tile v-bind:key="tile.id" v-for="tile in FilterLayerZ" @tile_clicked="TileClicked"></MapTile>
    </div>
</template>

<script>
    import MapTile from './map_tile.vue';

    export default {
        props: ['tiles', 'layerZ', 'globalMapOffset'],
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
            },
            scalingFactor() {
                return 1.5 - (this.layerZ * 0.25);
            }
        },
        methods: {
            TileClicked: function(event) {
                this.$emit('tile_clicked', event);
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