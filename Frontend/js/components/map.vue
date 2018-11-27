<template>
    <div
    v-on:mousedown='mouseDown'
    v-on:mouseup='mouseUp'
    v-on:mousemove='mouseMove'
    v-on:mouseleave='mouseLeave'
    >
        <MapMenu v-bind:pos="menu"></MapMenu>

        <div id="map">
            <MapLayer layerZ="2" v-bind:tiles="tiles" v-bind:globalMapOffset="globalMapOffset" @tile_clicked="TileClicked"></MapLayer>
            <MapLayer layerZ="1" v-bind:tiles="tiles" v-bind:globalMapOffset="globalMapOffset" @tile_clicked="TileClicked"></MapLayer>
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
                tiles: [],

                menu: {x: 0, y: 0},

                isMouseDown: false,
                globalMapOffset: {x:0, y:0},
                mouseMovement: {x:0, y:0}
            }
        },
        mounted () {
            this.axios
                .get(this.$config.RequestUriPrefix + '/api/v1/map/demo/10',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => ( this.tiles = response.data))
                .catch(error => console.log(error));
        },
        methods: {
            TileClicked: function(event) {
                if((this.mouseMovement.x < 5) && (this.mouseMovement.y < 5))
                {
                    this.menu.x = event.pageX;
                    this.menu.y = event.pageY;
                }
            },
            mouseDown: function(event) {
                this.isMouseDown=true;
                this.mouseMovement={x:0, y:0};
            },
            mouseUp: function(event) {
                this.isMouseDown=false;
            },
            mouseMove: function(event) {
                if(this.isMouseDown)
                {
                    this.mouseMovement.x += Math.abs(event.movementX);
                    this.mouseMovement.y += Math.abs(event.movementY);
                    //var MapOffset = 
                    var angle = -45 * Math.PI / 180
                    this.globalMapOffset.x += event.movementX * Math.cos(angle) - event.movementY * Math.sin(angle);
                    this.globalMapOffset.y += (event.movementY * Math.cos(angle) + event.movementX * Math.sin(angle));
                    this.menu.x = 0;
                    this.menu.y = 0;
                }
            },
            mouseLeave: function(event) {
                this.isMouseDown=false;
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
    transform: rotateX(45deg) rotateZ(45deg);
}

</style>