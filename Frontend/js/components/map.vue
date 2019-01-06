<template>
    <div
    v-on:mouseup='mouseUp'
    v-on:mousemove='mouseMove'
    v-on:mouseleave='mouseLeave'
    v-on:mousedown='mouseDown'

    v-on:touchend='touchUp'
    v-on:touchmove='touchMove'
    v-on:touchleave='touchLeave'
    v-on:touchcancel='touchLeave'
    v-on:touchstart='touchDown'

    id="mapbg"
    >
        <MapMenu ></MapMenu>

        <div id="map">
            <MapLayer layerZ="2" v-bind:tiles="TilesArray[2]"></MapLayer>
            <MapLayer layerZ="1" v-bind:tiles="TilesArray[1]"></MapLayer>
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
                mouseMoved: false,
                moveX: 0,
                moveY: 0,
                touchLastPos: {x: 0, y:0}
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
            window.requestAnimationFrame(this.animationCallback);
        },
        methods: {
            animationCallback: function (timestamp) {
                requestAnimationFrame(this.animationCallback);
                if(this.mouseMoved)
                {
                    this.$store.commit("MouseMove", {x: this.moveX, y: this.moveY});
                    this.moveX = 0;
                    this.moveY = 0;
                    this.mouseMoved = false;
                }
            },
            //Mouse Events
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
                    this.mouseMoved = true;
                    this.moveX += event.movementX;
                    this.moveY += event.movementY;
                }
            },
            mouseLeave: function(event) {
                this.isMouseDown = false;
            },
            //Touch Events
            touchDown: function(event) {
                this.isMouseDown = true;
                this.$store.commit("ClearMouseMove");
                if(this.$store.state.menuVisible == true)
                {
                    this.$store.commit("SetMenuVisible", false);
                    this.$store.commit("SetMenuClosed", true);
                }
                this.touchLastPos.x = event.changedTouches[0].clientX;
                this.touchLastPos.y = event.changedTouches[0].clientY;
            },
            touchUp: function(event) {
                this.isMouseDown = false;
            },
            touchMove: function(event) {
                if(this.isMouseDown)
                {
                    this.$store.commit("MouseMove", {x: event.changedTouches[0].movementX, y: event.changedTouches[0].movementY});
                }
            },
            touchLeave: function(event) {
                this.isMouseDown=false;
            },
            touchUp: function(event) {
                this.isMouseDown = false;
                
            },
            touchMove: function(event) {
                
                if(this.isMouseDown)
                {
                    this.moveX += event.changedTouches[0].clientX - this.touchLastPos.x;
                    this.moveY += event.changedTouches[0].clientY - this.touchLastPos.y;
                    this.mouseMoved = true;
                }
                this.touchLastPos.x = event.changedTouches[0].clientX;
                this.touchLastPos.y = event.changedTouches[0].clientY;
                //console.log(event.changedTouches[0]);
            },
            touchLeave: function(event) {
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