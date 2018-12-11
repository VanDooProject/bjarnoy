<template>
    <div
    v-on:mouseup='mouseUp'
    v-on:mousemove='mouseMove'
    v-on:mouseleave='mouseLeave'
    v-on:mousedown='closeMenu'
    id="mapbg"
    >
        <MapMenu v-bind:pos="menu" v-bind:tile="tile"></MapMenu>

        <div id="map" v-on:mousedown='mouseDown'>
            <MapLayer layerZ="2" v-bind:tiles="TilesArray[2]" v-bind:globalMapOffset="globalMapOffset" @tile_clicked="TileClicked"></MapLayer>
            <MapLayer layerZ="1" v-bind:tiles="TilesArray[1]" v-bind:globalMapOffset="globalMapOffset" @tile_clicked="TileClicked"></MapLayer>
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
                islands: [],
                menu: {x: 0, y: 0},
                tile: undefined,
                isMouseDown: false,
                globalMapOffset: {x:0, y:0},
                mouseMovement: {x:0, y:0},
                menuClosed: false
            }
        },
        computed: {
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
            tiles () {
                var arr = []
                if(this.islands)
                this.islands.forEach(island => {
                    if(island.bioms)
                    island.bioms.forEach(biome => {
                        if(biome.tiles)
                        biome.tiles.forEach(tile => {
                            arr.push(tile);
                        });
                    });
                });
                return arr;   
            }
        },
        mounted () {
            this.axios
                .get(this.$config.RequestUriPrefix + '/api/v1/Map/demo/island/10',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => ( this.islands = response.data))
                .catch(error => console.log(error));
        },
        methods: {
            TileClicked: function(event, tile) {
                if((this.mouseMovement.x < 5) && (this.mouseMovement.y < 5))
                {
                    if(!this.menuClosed)
                    {
                        this.menu.x = event.pageX;
                        this.menu.y = event.pageY;
                        this.tile = tile;    
                    }
                }
            },
            mouseDown: function(event) {
                this.isMouseDown = true;
                this.mouseMovement = {x:0, y:0};
            },
            mouseUp: function(event) {
                this.isMouseDown = false;
            },
            mouseMove: function(event) {
                if(this.isMouseDown)
                {
                    this.mouseMovement.x += Math.abs(event.movementX);
                    this.mouseMovement.y += Math.abs(event.movementY);
                    var angle = -45 * Math.PI / 180;
                    this.globalMapOffset.x += event.movementX * Math.cos(angle) - event.movementY * 2 * Math.sin(angle);
                    this.globalMapOffset.y += (event.movementY * 2 * Math.cos(angle) + event.movementX * Math.sin(angle));
                }
            },
            mouseLeave: function(event) {
                this.isMouseDown=false;
            },
            closeMenu: function() {
                if(this.menu.x != 0)
                {
                    this.menuClosed = true;
                    this.menu = {x:0, y:0};
                    this.tile = undefined;
                }
                else
                {
                    this.menuClosed = false;
                }
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