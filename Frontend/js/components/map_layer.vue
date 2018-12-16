<template>
    <div class="maplayer"
            v-bind:style="{
                transform: 'translate(' + mapOffset.x * scalingFactor + 'px ,' 
                    + mapOffset.y  * scalingFactor + 'px) ' +
                    'scale(' + scalingFactor + ')',
                // currently maybe not effecting all browsers could be fixed with https://stackoverflow.com/questions/826782/how-to-disable-text-selection-highlighting
                userSelect: 'none'
            }"    
        >
        <MapTile v-bind:tile=tile v-bind:key="tile.id" v-for="tile in tiles"></MapTile>
    </div>
</template>

<script>
    import MapTile from './map_tile.vue';

    export default {
        props: ['tiles', 'layerZ'],
        data: function() {
            return {

            }
        },
        computed: {
            scalingFactor() {
                return 1.25 - (this.layerZ * 0.25);
            },
            mapOffset() {
                return this.$store.state.mapOffset;
            }
        },
        methods: {
            
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

    /*https://stackoverflow.com/questions/826782/how-to-disable-text-selection-highlighting*/
    -webkit-touch-callout: none;/* iOS Safari */
    -webkit-user-select: none;  /* Safari */
    -khtml-user-select: none;   /* Konqueror HTML */
    -moz-user-select: none;     /* Firefox */
    -ms-user-select: none;      /* Internet Explorer/Edge */
    user-select: none;          /* Non-prefixed version, currently */
                                /* supported by Chrome and Opera */
}

</style>