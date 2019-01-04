<template>
    <div>
        <MapMenu></MapMenu>
        <div
        v-on:mouseup='mouseUp'
        v-on:mousemove='mouseMove'
        v-on:mouseleave='mouseLeave'
        v-on:mousedown='mouseDown'
        id="mapbg"
        >
            <div id="map">
                <MapLayer layerZ="2" v-bind:tiles="TilesArray[2]"></MapLayer>
                <MapLayer layerZ="1" v-bind:tiles="TilesArray[1]"></MapLayer>
            </div>
        </div>
    </div>
</template>

<script>
    import MapLayer from './map_layer.vue';
    import MapMenu from './menu.vue';
    
    export default {
        components: {
            MapLayer,
            MapMenu
        },
        props: [],
        data: function() {
            return {
                // will be a three-dimensional array with map coords
                isMouseDown: false,
            }
        },
        computed: {
            tiles() { 
                return this.$store.state.mapTiles;
            },
            TilesArray () {
                var ls = [[]];
                this.tiles.forEach(tile => {
                    var zLayer = Math.round(tile.position.z);
                    if(ls[zLayer] == undefined)
                    {
                        ls[zLayer]=[];
                    }
                    ls[zLayer].push(tile);
                });
                return ls;
            },
        },
        mounted () {
            this.$store.dispatch("UpdateMapTiles");
        },
        methods: {
            mouseDown: function(event) {
                this.isMouseDown = true;
                this.$store.commit("ClearMouseMove");
                if(this.$store.state.menuVisible == true)
                {
                    this.$store.commit("SetMenuVisible", false);
                    this.$store.commit("SetMenuClosed", true);
                }
            },
            mouseUp: function(event) {
                this.isMouseDown = false;
            },
            mouseMove: function(event) {
                if(this.isMouseDown)
                {
                    this.$store.commit("MouseMove", {x: event.movementX, y: event.movementY});
                }
            },
            mouseLeave: function(event) {
                this.isMouseDown = false;
            }

        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map.vue
</script>

<style>
html, body {
    padding: 0px;
    margin: 0px;

    width: 100%;
    height: 100%;
    overflow: hidden;
}

#map {
    display: block;
    padding: 0px;
    margin: 0px;
    min-width: 100%;
    min-height: 100%;
    position: fixed;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    z-index: 0;
    transform: rotateX(60deg) rotateZ(45deg);
}
#mapbg{
    display: block;
    padding: 0px;
    margin: 0px;
    min-width: 100%;
    min-height: 100%;
    position: fixed;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
}

</style>